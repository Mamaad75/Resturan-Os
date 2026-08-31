# FoodOS — architecture

Decisions, and the reasoning behind them.

---

## 1. Shape of the system

A **modular monolith** on NestJS, one Next.js frontend, one PostgreSQL
database.

Microservices were rejected deliberately. A restaurant group's traffic fits
comfortably on one node, and the operational cost — network hops inside a
single order transaction, distributed tracing, eventual consistency between
an order and its payment — would buy nothing. Instead every module owns its
data access and exposes a service, so the seams for later extraction already
exist:

```
apps/api/src/modules/
  auth  restaurants  menu  tables  orders  payments
  notifications  sms  reports  staff  qr  storage  audit  realtime
```

Modules talk through injected services and an internal event bus, never by
reaching into each other's tables. `reports`, `sms` and `payments` are the
obvious first candidates for extraction; none of their call sites would
change.

The frontend is a single Next.js app with route groups rather than separate
applications, because the four surfaces share a design system, an API client
and an auth context. Route-level code splitting means a customer scanning a QR
code never downloads admin code — the customer menu's first-load JS excludes
the dashboard, charts and POS entirely.

---

## 2. Domain model

```
Tenant
└── Restaurant  (branding, service modes, tax/service-charge config)
    └── Branch  (order counter, open/closed)
        ├── Menu → Category → Product → ModifierGroup → ModifierOption
        ├── RestaurantTable → QrCode
        ├── Order
        │   ├── OrderItem → OrderItemModifier
        │   ├── OrderStatusHistory
        │   └── Payment
        └── User (staff)

Customer ──< Order            (matched by phone, per tenant)
Notification, SmsMessage, AuditLog   (tenant-scoped, order-linked)
```

Three modelling decisions worth calling out:

**Order items capture their own product identity.** `productName`,
`productNameFa`, `unitPrice` and each modifier's `priceDelta` are copied onto
the order at creation. A price change, a rename or a deletion cannot rewrite
history, and a deleted product simply nulls the FK while the receipt and the
report stay correct.

**`tenantId` is denormalised onto child tables** — order items, modifiers,
status history, payments. It is redundant with the parent's tenant, and that
is the point: an isolation bug cannot hide behind a join, and the runtime
guard can check every model uniformly.

**Order and Payment are separate aggregates.** An order can be split across
several payments, refunded partially, or settled by a method no gateway knows
about. Folding payment state into the order would make split bills and
refunds structurally awkward.

---

## 3. Tenant isolation

The property that matters most in multi-tenant SaaS, so it is enforced twice.

**Layer 1 — explicit filtering.** Tenant identity comes from the verified
access token and nowhere else. It is never read from a body, query string or
header, which is what makes it unforgeable. Every service query includes
`tenantId`.

**Layer 2 — a runtime guard.** A Prisma client extension inspects every
operation on a tenant-owned model and raises `TenantIsolationError` when the
`where` clause carries no tenant filter, or when a create does not set one. It
accepts `tenantId`, a compound unique containing it (`tenantId_orderNumber`),
or an `AND` clause containing it.

```ts
prisma.order.findMany({ where: { status: 'PENDING' } })                 // throws
prisma.order.findMany({ where: { tenantId, status: 'PENDING' } })       // fine
```

Because interactive transactions hand back the *extended* client, the guard
applies inside transactions too.

**Deliberate exceptions** are wrapped in `runAsSystem(reason, fn)`, which
names the intent at the call site. There are three: resolving which tenant a
login email belongs to, looking up an order by its public tracking token, and
the SMS outbox sweep.

```ts
export async function runAsSystem<T>(reason: string, fn: () => Promise<T> | T) {
  return systemScope.run({ reason }, async () => await fn());
}
```

The `await` inside the scope is load-bearing. A Prisma promise does not
execute when it is created; returning it directly would run the query after
the async-local scope had unwound, and the guard would fire anyway. This was
caught by a test that asserts the scope survives an await.

**Proof.** Seventeen integration tests drive two fully independent tenants
through the real HTTP API and assert that neither can read the other's
products, orders, tables or staff; cannot mutate, delete, pay for or cancel
the other's records; cannot order across tenants; sees only its own revenue;
and cannot reach an order without its tracking token. Cross-tenant access
returns 404, never 403 — a 403 would confirm the record exists.

---

## 4. Order lifecycle

### One transaction

```
BEGIN
  validate table (exists, in this branch, not disabled)
  resolve every line from the live menu → prices, modifier rules
  compute subtotal → discount → service charge → VAT → total
  allocate order number:  UPDATE branches SET orderSequence = orderSequence + 1
                          WHERE id = $1 RETURNING orderSequence
  insert order + items + item modifiers + status history
  seat the table
  upsert the customer
COMMIT
→ emit domain events
```

`UPDATE … RETURNING` takes a row lock, so two customers submitting at the same
instant cannot receive the same order number. A test fires eight concurrent
submissions and asserts all numbers are unique.

Events are emitted **after** commit. No subscriber can observe an order that
subsequently rolls back.

### Server-side pricing

The client sends product ids, quantities and chosen modifier ids. Nothing
else. Every price, surcharge, tax and total is looked up server-side, and a
`price` or `total` field in the request body is simply ignored — there is no
code path that reads one.

Modifier options are validated against the product that owns them, so an
option from a different product is rejected rather than silently applied.
Required-group, min-select and max-select rules are enforced identically on
both sides, from the same shared schema.

A discount code is the same story. The customer app can preview what a code
would take off, but that preview is advisory: the discount is recomputed
inside the order transaction from the subtotal the server calculated. The
redemption itself is claimed with a conditional update:

```sql
UPDATE "coupons" SET "usageCount" = "usageCount" + 1
 WHERE "id" = $1 AND "isActive" = true
   AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
```

A read-then-write would let simultaneous customers overshoot a usage limit
under `READ COMMITTED` — each transaction reads the pre-increment count and
each believes it has room. The conditional update cannot: the row lock
serialises them, and a claim that finds no room affects zero rows and fails
the order. The integration suite fires ten concurrent orders at a
three-use coupon and asserts exactly three succeed.

### The state machine

`packages/types/src/order-state-machine.ts` is the single authority. The API
enforces it; the POS and KDS render buttons from `allowedTransitions` on the
order itself. The UI therefore cannot offer a transition the server would
reject — the two can never drift.

```
Dine-in:   PENDING → CONFIRMED → SENT_TO_KITCHEN → PREPARING → READY → SERVED → COMPLETED
Takeaway:  PENDING → CONFIRMED → SENT_TO_KITCHEN → PREPARING → READY_FOR_PICKUP → PICKED_UP → COMPLETED
Cancel:    PENDING | CONFIRMED | SENT_TO_KITCHEN | PREPARING | READY → CANCELLED
```

Two rules beyond the table itself: `COMPLETED` is refused while the order is
unpaid, and terminal states have no outgoing transitions. Every change writes
an `OrderStatusHistory` row with the actor and an optional note.

### Table coupling

Table state follows the order lifecycle rather than the UI, so a table can
never be left stuck occupied:

- create → `OCCUPIED`, `activeOrderId` set
- `SERVED` while unpaid → `WAITING_PAYMENT`
- `COMPLETED` / `CANCELLED` → released, but only once **no** order is still
  open on it (a second round on the same table keeps it occupied)

---

## 5. Events and realtime

Services emit internal domain events (`domain.order.created`,
`domain.order.status_changed`, `domain.payment.recorded`,
`domain.table.updated`). Three subscribers act independently:

- **RealtimeGateway** → fans out to WebSocket rooms
- **OrderNotificationsListener** → writes notifications, queues SMS
- **SmsWorker** → cron sweep over the outbox

That decoupling is why a failing SMS provider cannot roll back or block an
order. Listener failures are logged and swallowed; a notification that could
not be written must never fail the business operation that triggered it.

### Room authorisation

| Client | Credential | Rooms |
| --- | --- | --- |
| Staff | Access token | `user:<id>`, `branch:<id>`, plus `kitchen:<id>` only with `kitchen:read` |
| Customer | Order tracking token | `order:<id>` — exactly one |
| Neither | — | Disconnected immediately |

A customer socket is structurally incapable of subscribing to a branch feed;
there is no code path that joins one. A test asserts a customer socket
receives its own order's events and no table traffic.

Every realtime screen also polls and shows a live/reconnecting indicator, so a
blocked WebSocket upgrade degrades visibly rather than silently freezing.

---

## 6. Provider abstractions

### Payment

```
PaymentProvider
├── createPayment()   → { providerRef, redirectUrl, settled }
├── verifyPayment()   → { verified, referenceId }
├── refund()
└── getPaymentStatus()
```

`ManualPaymentProvider` handles cash, card terminal and other in-person
settlement. It settles immediately and makes no network call, because the
money changed hands before the request arrived. This is a real provider, not a
stub — most orders in an Iranian café are paid exactly this way.

`ZarinpalPaymentProvider` is a full implementation of a real gateway: it
converts Toman to Rial at the boundary, returns a redirect, and leaves the
payment `PENDING`. Only the verified callback marks it `PAID`, so an abandoned
redirect never marks an order paid, and verification is idempotent because
gateways retry callbacks.

Adding a gateway means implementing the interface and registering it in
`createPaymentProviders()`.

### SMS

Same shape (`send`, `getStatus`, `normalizePhone`) with `console` (default),
`kavenegar` and `sms_ir` adapters, all using `fetch` rather than vendor SDKs.

Delivery runs through a **transactional outbox**:

```
enqueue → persist SmsMessage(PENDING) → attempt immediately
        → success: SENT + providerRef
        → failure: attempts++, nextAttemptAt = attempts² minutes
        → exhausted (SMS_MAX_ATTEMPTS): FAILED, logged loudly
cron (1 min)  → sweep messages that are due
cron (5 min)  → reconcile delivery receipts → DELIVERED
```

The row is persisted before delivery is attempted, so an outage can delay a
message but never lose it — and never fails the order.

### Storage

`StorageProvider` with `local` and `s3` drivers. Image binaries never go into
PostgreSQL; only a URL is stored. Uploads are decoded through sharp — which
validates that the bytes really are an image and not a renamed payload — then
re-encoded to WebP, which strips metadata and keeps the customer menu fast on
mobile networks. Keys are namespaced per tenant, so one restaurant cannot
overwrite another's asset by guessing a key.

The `local` driver hands out `${STORAGE_PUBLIC_URL}/<key>` links, so the API
mounts its storage directory at that URL's path. The `s3` driver points at the
bucket and nothing is mounted. That mount lives in `src/bootstrap.ts` alongside
the rest of the HTTP wiring, which both `main.ts` and the integration harness
call — a test request therefore travels the exact middleware chain a real one
does, and a gap like an unserved upload directory shows up in the suite rather
than in production.

---

## 7. Money and time

**Money** is an integer in the branch's currency unit (Toman by default).
Integer arithmetic removes floating-point drift entirely; there is no decimal
type anywhere in the schema or the API. Formatting to `۱۲۵٬۰۰۰ تومان` happens
only at the edge.

Order of operations, matching Iranian invoice practice:

```
base           = subtotal − discount            (discount clamped to [0, subtotal])
serviceCharge  = round(base × serviceChargeBps / 10 000)
tax            = round((base + serviceCharge) × taxRateBps / 10 000)
total          = base + serviceCharge + tax
```

Rates are stored in basis points, so 9.00 % is `900` — no fractional
percentages to round twice.

**Time.** Every business-day boundary is Asia/Tehran. A "today's revenue"
figure computed in UTC would be wrong by three and a half hours for every
restaurant on the platform.

Prisma maps `DateTime` to `timestamp(3)` **without** time zone, storing UTC.
Report queries therefore anchor before converting:

```sql
date_trunc('hour', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')
```

Label components come back from SQL as integers rather than as a timestamp,
because `date_trunc` on a naive timestamp yields Tehran wall-clock time that
the driver would re-interpret through the process timezone and shift. Dates
are displayed on the Persian (Jalali) calendar.

---

## 8. Security posture

| Concern | Approach |
| --- | --- |
| Passwords | Argon2id, 64 MiB / 3 iterations / 4 lanes; a malformed stored hash reads as "wrong password", never a crash |
| Account enumeration | Identical response and comparable CPU cost for unknown emails and wrong passwords |
| Sessions | Short-lived JWT access token; opaque refresh token stored **hashed**, rotated on every use, so a stolen cookie works at most once |
| Token storage | httpOnly cookies; nothing in `localStorage` where an XSS could read it |
| Authorisation | Guards registered globally and fail closed — a route is protected unless it opts out with `@Public()` |
| Permissions | Routes declare permissions, never roles; the role matrix lives in one shared file |
| Input | Zod on every mutating endpoint, validating **and** normalising (trim, Persian digits, phone canonicalisation) |
| Stored text | Angle brackets and control characters rejected, so a name cannot smuggle markup into a receipt or SMS |
| SQL injection | Parameterised throughout; raw SQL uses tagged templates |
| Rate limiting | One global bucket, tighter per-route budgets on login and anonymous order submission |
| Error leakage | Stack traces, SQL and Prisma messages logged server-side, never returned |
| Uploads | Type and size checked, decoded and re-encoded, tenant-namespaced |
| Audit | Append-only log of privileged actions; writes are fire-and-forget so an audit failure cannot fail the operation, but always log |
| Secrets | Environment only; production refuses to boot with a short `JWT_ACCESS_SECRET` |

### A note on rate limiting

`@nestjs/throttler` applies **every** configured named throttler to **every**
route unless explicitly skipped. Configuring a strict `auth` throttler
globally therefore rate-limits the entire API at the login rate — which is
exactly what happened here, and what the integration tests caught. The fix is
a single global throttler with per-handler overrides
(`src/common/throttle.ts`).

---

## 9. Frontend architecture

**Data layer.** TanStack Query owns server state; there is no global store and
no API call scattered inside a component. `services/index.ts` is the only
place that knows URL shapes.

**Auth.** Tokens live in httpOnly cookies, so on a fresh page load the app has
no idea who it is until it asks. `AuthProvider` bootstraps via
`/auth/refresh`, which both rotates the session and returns the identity. The
access token is additionally kept in memory for the WebSocket handshake.
Concurrent 401s share a single refresh call — otherwise a page firing six
queries at once would rotate the refresh token six times and invalidate all
but one.

The customer surface skips the bootstrap entirely: a QR scan has no session,
and a guaranteed 401 has no business on that critical path.

**Design system.** Colours are declared as raw RGB channels in CSS custom
properties and surfaced as Tailwind tokens. That indirection is what lets a
restaurant re-theme its customer menu (accent colour, light/dark) at runtime
without a rebuild. Gold is reserved for primary actions, active navigation and
the numbers that matter; overusing it would make it mean nothing.

**Menu templates.** A restaurant chooses how its customer menu is laid out,
not just what colour it is. A template is a descriptor in
`packages/types/src/menu-templates.ts` — layout, heading treatment, corner
radius, density, price weight — and `templateStyles()` in the web app is the
single place that turns one into class names.

Templates carry no colours of their own: every rule they produce paints with
`--gold`, the restaurant's own accent, so identity stays with the restaurant
and the template supplies only structure. Switching template therefore never
overwrites a palette somebody chose on purpose; each template's suggested
colours are offered as a button instead. The live menu and
the admin's preview thumbnails both call it, so what an owner sees while
choosing is what a guest gets; a preview drawn from separate rules would drift
the first time either changed.

Photo-led templates resolve their layout per category rather than per menu: a
category where nothing has been photographed falls back to the list, because a
grid of empty frames is a worse first impression than a plain list, and every
newly signed-up restaurant starts with no photos. The rest of the template
still applies, so the choice is not silently discarded.

**RTL.** Logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)
throughout rather than physical left/right, so the layout mirrors correctly.
Vazirmatn is self-hosted — no external font request on the customer's first
paint.

**Responsive.** Mobile gets different interaction patterns, not a shrunken
desktop: modals become bottom sheets, the admin sidebar becomes bottom
navigation plus a drawer, the POS ticket rail becomes a bottom sheet, and the
customer menu is designed mobile-first and scaled up.

---

## 10. Testing strategy

**Unit tests (104)** cover pure logic with no I/O: money arithmetic and
rounding, Tehran day boundaries and report ranges, the full state-machine
transition table, the RBAC matrix, and the tenant guard's accept/reject rules.

**Integration tests (206)** boot the real Nest application against a real
PostgreSQL database with no mocks, because the behaviour worth covering only
exists end to end — transactions, isolation, the state machine, money. Each
suite truncates the database, so tests never depend on each other.

Notable cases: refresh-token replay is rejected after rotation; a tampered
request with client-supplied prices is priced from the menu anyway; a failed
line rolls back the whole order; eight concurrent submissions get eight
distinct order numbers; a table stays occupied while a second order is open on
it; a split bill only flips to `PAID` on the final payment; an unpaid order
never appears in revenue; ten simultaneous orders cannot push a three-use
coupon past three redemptions; a guest cannot rate an order that has not been
served; a repeat waiter call returns the open one instead of a second; a
product update replaces its modifier groups without leaving orphaned options;
and a PHP payload renamed to `.png` is rejected by the upload pipeline.

---

## 11. The platform tier

FoodOS sits above the tenants it serves, and the two are kept apart
deliberately.

**A separate identity.** `PlatformAdmin` is its own table, not a `User` with a
special role. Every `User` row requires a `tenantId` and is reached through
tenant-scoped queries, so a platform identity modelled that way would need
either a fake tenant or a hole in the isolation guard. Platform sessions are
signed with their own key (`JWT_PLATFORM_SECRET`), so a restaurant owner's
token cannot be replayed against `/platform` however it is crafted, and a
platform token is refused by every tenant route.

**Cross-tenant reads are explicit.** The isolation guard stays armed for the
platform module too; each query that legitimately spans tenants is wrapped in
`runAsSystem` with a stated reason, so the complete list of places that see
across the platform is greppable.

**Entitlements are computed, never cached.** `PlansService.entitlements()`
resolves a tenant's plan, its live usage and its effective subscription status
on every check. Status is derived from dates rather than stored, so an expiry
takes effect at the instant it falls due without a scheduled job having run,
and raising a limit applies on the very next request.

**The gate fails closed.** A tenant with no subscription row reads as expired
rather than unlimited. That is what makes the seeded test tenants need an
explicit subscription — and it is the only safe default for a billing gate.

**Writes stop, reads do not.** `SubscriptionGuard` refuses mutating requests
once a subscription has lapsed, and leaves reads alone: a restaurant whose
invoice is late should still be able to see its own orders and the page that
explains why. Public order creation is gated inside the order service instead,
because an anonymous QR request has no session for a guard to read a tenant
from.

---

## 12. Known limits

Honest about what this version does not do:

- **The S3 storage driver** has its interface, configuration and validation
  wired, but `put`/`delete` need `@aws-sdk/client-s3` installed. Selecting it
  fails loudly at boot rather than silently dropping uploads.
- **ZarinPal refunds** require a separate merchant agreement; automatic
  refunds return a clear error directing the operator to record it manually.
- **Delivery** exists as an enum and a settings toggle but has no courier
  lifecycle.
- **The SMS worker runs in-process.** Correct for a single-node deployment;
  the queue is in PostgreSQL, so moving it to its own process needs no schema
  change.
- **Redis is wired but optional.** Running multiple API instances behind a load
  balancer needs the socket.io Redis adapter enabled.
