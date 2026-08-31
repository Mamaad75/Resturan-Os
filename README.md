# FoodOS

Multi-tenant SaaS for cafes, restaurants and fast-food businesses: a digital
menu and ordering system wired to a customer book, so each order becomes a
reason for the next one.

> The npm workspace packages are still named `@restaurant-os/*` and the default
> database is still `restaurant_os`. Those are internal identifiers, deliberately
> left alone: renaming them would mean a migration and a redeploy for no
> user-visible gain. The product is FoodOS everywhere a person can see it.

A multi-tenant restaurant and café operating system built for the Iranian
market: digital menu, QR ordering, counter (POS), kitchen display, table
management, payments, notifications and sales reporting — Persian-first and
RTL throughout.

This is a working application, not a prototype. Every number on the dashboard
is a database aggregate, every price is computed on the server, and the whole
order lifecycle runs through a real state machine.

---

## Contents

- [Quick start](#quick-start)
- [What is included](#what-is-included)
- [Project structure](#project-structure)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Demo accounts](#demo-accounts)
- [Architecture](#architecture)
  - [Tenant isolation](#tenant-isolation)
  - [The order state machine](#the-order-state-machine)
  - [Realtime](#realtime)
  - [Payment and SMS provider abstraction](#payment-and-sms-provider-abstraction)
  - [Money and time](#money-and-time)
- [API documentation](#api-documentation)
- [Testing](#testing)
- [Production build](#production-build)
- [Future-ready modules](#future-ready-modules)

---

## Quick start

Requirements: **Node 20+**, **pnpm 9+**, and **PostgreSQL 16** (via Docker or
installed locally).

```bash
# 1. Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# 2. Configure
cp .env.example .env          # then edit the secrets

# 3. Install, migrate and seed
pnpm setup

# 4. Run both apps
pnpm dev
```

| Surface           | URL                                             |
| ----------------- | ----------------------------------------------- |
| Admin dashboard   | http://localhost:3000/admin                     |
| Counter (POS)     | http://localhost:3000/pos                       |
| Kitchen display   | http://localhost:3000/kds                       |
| Customer menu     | http://localhost:3000/r/cafe-roz                |
| Self-service signup | http://localhost:3000/signup                  |
| Table 7 menu (QR) | http://localhost:3000/r/cafe-roz/t/7            |
| API               | http://localhost:4000/api                       |
| API docs (Swagger)| http://localhost:4000/api/docs                  |

Running the whole stack in containers instead:

```bash
docker compose --profile app up -d --build
```

---

## What is included

**Customer**
Server-rendered QR menu (fast first paint on mobile), category navigation,
product detail with modifiers, cart, dine-in and takeaway checkout, discount
codes, a call-the-waiter button, a live order-tracking page with in-app
notifications, and a rating prompt once the order has been served.

**Admin**
Dashboard with real sales aggregates, order list and detail, table floor plan,
full menu editing (categories, products, images, modifier groups), discount
campaigns, sales reports, staff and roles, restaurant settings and branding,
QR code generation and a printable QR sheet.

**FoodOS platform console** (`/superadmin`)
A super admin above every tenant: dashboard totals and recurring revenue, the
full tenant list with search and status filters, tenant detail with usage
against plan limits, suspend/activate/disable/restore, plan changes,
subscription dates, trial and grace windows, manual extension, private notes,
and an audit trail of every action with its before and after values.

**Plans and subscriptions**
Dynamic plan rows, not hardcoded tiers. Each carries limits (branches, staff,
products, tables, monthly orders, marketing SMS) and feature flags (menu
customizer, advanced customization, custom CSS, CRM, campaigns, dine-in,
takeaway, waiter call, reports, coupons, multi-branch). Everything is enforced
in the API: a plan that allows two branches refuses the third whether the
request comes from the admin or from curl.

**Customers (CRM)**
A customer book built from order phone numbers, with lifetime value, average
order, dine-in vs takeaway split, first and last order, tags, notes and
marketing consent. Segments (new, returning, VIP, high value, inactive 30/60,
dine-in, takeaway) filter the list and choose a campaign's recipients from the
same definition.

**SMS campaigns**
Marketing messages, separated from transactional ones at the model level.
Consent is part of the recipient query, so a campaign can only ever reach
somebody who opted in, and the send is charged against the plan's monthly
allowance.

**Per-restaurant look**
Five menu presets — کلاسیک، سنتی ایرانی، کافه، فست‌فود، مینیمال — and a full
theme customizer beside them: colours, typography, layout, product card,
header, buttons and footer, with a phone-sized live preview rendered through
the same code the real menu uses. Draft and publish are separate, so an owner
can experiment without changing what guests see. On the Business plan, custom
CSS is scoped to the menu container and cannot reach the admin.

**Onboarding**
A restaurant signs itself up at `/signup` — tenant, restaurant, branch, menu,
starter categories, owner account and QR code are created in one transaction —
and lands on a checklist that tracks first product, first table and first QR
against live data.

**Counter (POS)**
Category rail, product grid, live ticket, table picker, modifier picker,
split payments, receipt printing (58mm / 80mm / A4).

**Kitchen**
Three-column ticket rail with age-based urgency colouring and large touch
targets; actions come from the order's own permitted transitions.

Deliberately **out of scope** for this version: inventory, full accounting,
payroll, supplier management, loyalty, CRM and delivery fleet. The
architecture leaves room for each — see
[Future-ready modules](#future-ready-modules).

---

## Project structure

```
restaurant-os/
├── apps/
│   ├── api/                     NestJS modular monolith
│   │   ├── prisma/
│   │   │   ├── schema.prisma    Full data model
│   │   │   ├── migrations/      Versioned SQL migrations
│   │   │   ├── seed.ts          Persian demo data
│   │   │   └── seed-data.ts     Menu, staff and customer fixtures
│   │   ├── src/
│   │   │   ├── common/          Guards, filters, pipes, decorators, utils
│   │   │   ├── config/          Typed environment configuration
│   │   │   ├── events/          Internal domain events
│   │   │   ├── prisma/          Client factory + tenant isolation guard
│   │   │   └── modules/
│   │   │       ├── auth/        Login, refresh rotation, password change
│   │   │       ├── signup/      Self-service tenant provisioning
│   │   │       ├── restaurants/ Restaurant, branding, settings, branches
│   │   │       ├── menu/        Categories, products, modifiers, public menu
│   │   │       ├── tables/      Floor plan and table state
│   │   │       ├── orders/      Order aggregate, pricing, state machine
│   │   │       ├── payments/    Payment aggregate + gateway adapters
│   │   │       ├── notifications/ In-app notifications + event listener
│   │   │       ├── sms/         Transactional outbox + provider adapters
│   │   │       ├── coupons/     Discount codes and redemption
│   │   │       ├── guest/       Waiter calls and order feedback
│   │   │       ├── reports/     SQL sales analytics
│   │   │       ├── staff/       Staff accounts and roles
│   │   │       ├── qr/          QR generation (SVG/PNG/print sheet)
│   │   │       ├── storage/     Image pipeline + storage drivers
│   │   │       ├── audit/       Append-only audit log
│   │   │       └── realtime/    WebSocket gateway
│   │   └── test/                Integration tests against a real database
│   └── web/                     Next.js 15 App Router frontend
│       └── src/
│           ├── app/
│           │   ├── (app)/       Authenticated admin surfaces
│           │   ├── (fullscreen)/ POS and kitchen display
│           │   ├── r/[slug]/    Customer QR menu
│           │   ├── order/track/ Customer order tracking
│           │   └── login/
│           ├── components/ui/   Design system
│           ├── features/        Auth, customer, admin feature modules
│           ├── hooks/           Realtime subscription
│           ├── lib/             API client, formatting, providers
│           └── services/        Typed API layer
├── packages/
│   ├── types/                   Domain enums, state machine, RBAC matrix
│   ├── validation/              Zod schemas shared by API and web
│   └── config/                  Shared TypeScript configuration
├── docker/                      Container init scripts
├── docs/                        API and architecture documentation
└── docker-compose.yml
```

---

## Environment variables

Copy `.env.example` to `.env`. Both apps read the same root file.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Separate database the test suite truncates freely |
| `REDIS_URL` | Optional; socket.io adapter and caching when scaling out |
| `API_PORT`, `API_PREFIX`, `API_URL` | API binding and public origin |
| `APP_URL` | Frontend origin; **QR codes point here** |
| `CORS_ORIGINS` | Comma-separated origins allowed to send credentials |
| `JWT_ACCESS_SECRET` | Access-token signing key (32+ chars in production) |
| `JWT_ACCESS_TTL` | Access-token lifetime in seconds (default 900) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-token lifetime (default 30) |
| `COOKIE_SECRET`, `COOKIE_DOMAIN`, `COOKIE_SECURE` | Cookie signing and scope |
| `THROTTLE_TTL`, `THROTTLE_LIMIT` | Global rate limit window and budget |
| `THROTTLE_AUTH_LIMIT` | Tighter budget for login |
| `THROTTLE_PUBLIC_ORDER_LIMIT` | Tighter budget for anonymous order submission |
| `SMS_PROVIDER` | `console` (default), `kavenegar`, `sms_ir` |
| `SMS_API_KEY`, `SMS_SENDER`, `SMS_MAX_ATTEMPTS` | SMS provider credentials and retry budget |
| `PAYMENT_PROVIDER` | `manual` (default), `zarinpal` |
| `PAYMENT_API_KEY`, `PAYMENT_CALLBACK_URL` | Gateway credentials and return URL |
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR`, `STORAGE_PUBLIC_URL` | Local driver paths |
| `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`, `STORAGE_REGION` | S3-compatible driver |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL` | Browser-visible endpoints |

Secrets are never committed. In production the app refuses to boot with a
short or missing `JWT_ACCESS_SECRET`.

---

## Commands

| Command | Description |
| --- | --- |
| `pnpm setup` | Install, build shared packages, generate client, migrate, seed |
| `pnpm dev` | Run API and web together in watch mode |
| `pnpm dev:api` / `pnpm dev:web` | Run one app |
| `pnpm build` | Production build of packages and both apps |
| `pnpm start` | Run the production builds |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm test` | Unit tests (fast, no database) |
| `pnpm test:e2e` | Integration tests against `TEST_DATABASE_URL` |
| `pnpm db:migrate` | Create and apply a migration in development |
| `pnpm db:migrate:deploy` | Apply pending migrations (production) |
| `pnpm db:seed` | Rebuild the demo tenant |
| `pnpm db:reset` | Drop, re-migrate and re-seed |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm docker:up` / `pnpm docker:down` | Start / stop infrastructure |

### Database setup from scratch

```bash
pnpm db:generate        # generate the Prisma client
pnpm db:migrate         # apply migrations (creates the schema)
pnpm db:seed            # load the کافه رُز demo tenant
```

The seed is idempotent: it removes and rebuilds the demo tenant on every run,
and leaves the branch order counter consistent with the history it generated.

---

## Demo accounts

Created by `pnpm db:seed`. **Development only** — every account is flagged
`mustChangePassword`, and the login screen exposes them because the seed data
is public by design.

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Owner | `owner@caferoz.ir` | `Owner12345` | `/admin` |
| Manager | `manager@caferoz.ir` | `Manager12345` | `/admin` |
| Cashier | `cashier@caferoz.ir` | `Cashier12345` | `/pos` |
| Kitchen | `kitchen@caferoz.ir` | `Kitchen12345` | `/kds` |
| Waiter | `waiter@caferoz.ir` | `Waiter12345` | `/pos` |
| Accountant | `accountant@caferoz.ir` | `Account12345` | `/admin/reports` |

The seed also creates: 5 categories, 19 products (with modifier groups), 36
tables across 4 zones, 37 QR codes, 6 customers and roughly 430 orders spread
over five weeks — so the dashboard and reports are useful on first launch.

**Never deploy the seed to production.** Create the first owner account
manually and delete the demo tenant.

---

## Architecture

A **modular monolith**: one deployable, hard module boundaries. Each module
owns its data access and exposes a service that other modules consume, so
reports, SMS or payments could later be extracted into their own processes
without touching call sites. Microservices from day one would have bought
nothing but latency and operational overhead.

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Tenant isolation

Tenant identity comes from the **verified access token and nowhere else** — never
from a request body, query string or header. Isolation is enforced in two
layers:

1. Every service filters by `tenantId` explicitly.
2. A Prisma client extension inspects every query touching a tenant-owned
   model and raises `TenantIsolationError` if the filter is missing. Because
   interactive transactions hand back the extended client, the guard applies
   inside transactions too.

Deliberate cross-tenant work — resolving which tenant a login email belongs
to, sweeping the SMS outbox — is wrapped in `runAsSystem(reason, fn)`, which
documents the intent at the call site. That function awaits inside the scope
on purpose: a Prisma promise does not execute when it is created, so simply
returning it would run the query after the scope had unwound.

`tenantId` is denormalised onto child tables (order items, modifiers, status
history) specifically so an isolation bug cannot hide behind a join.

This is covered by 17 integration tests that drive two real tenants through
the HTTP API and assert neither can read, write, order across, report on or
track the other's data.

### The order state machine

The transition table in `packages/types/src/order-state-machine.ts` is the
single authority. The API enforces it on every status change; the POS and KDS
render their action buttons from the same table, so the UI can never offer a
transition the server would reject.

```
Dine-in:   PENDING → CONFIRMED → SENT_TO_KITCHEN → PREPARING → READY → SERVED → COMPLETED
Takeaway:  PENDING → CONFIRMED → SENT_TO_KITCHEN → PREPARING → READY_FOR_PICKUP → PICKED_UP → COMPLETED
Cancel:    any of PENDING, CONFIRMED, SENT_TO_KITCHEN, PREPARING, READY → CANCELLED
```

Invalid transitions return `ORDER_INVALID_STATE` and name the permitted next
states. `COMPLETED` is refused while an order is unpaid. Every change writes
an `OrderStatusHistory` row recording who made it, when and why.

Order creation is a single transaction: validate the table, price every line
from the live menu, allocate a gapless order number via `UPDATE … RETURNING`
(which takes a row lock, so simultaneous submissions cannot collide), write
the order with its items, modifiers and history, and seat the table. Either
all of it lands or none of it does.

**The client never sets a price.** It sends product ids, quantities and chosen
modifier ids; the server looks up every price, surcharge, tax and total.
Modifier options are validated against the product that actually owns them.

### Realtime

Socket.IO at `/realtime`. Two kinds of client connect, authorised completely
differently:

- **Staff** present an access token, join their branch room, and join the
  kitchen room only if their role carries kitchen permissions.
- **Customers** present an order tracking token and join exactly one room —
  the room for their own order. They can never subscribe to a branch feed.

A socket presenting neither is disconnected immediately.

Services emit internal domain events; the gateway, the notification service
and the SMS outbox subscribe independently. That decoupling is why a failing
SMS provider can never roll back or block an order transaction. Events are
emitted **after** the transaction commits, so no subscriber can observe an
order that later rolls back.

Every realtime-driven screen also polls as a fallback and shows a
live / reconnecting indicator, so a blocked WebSocket upgrade degrades
visibly rather than silently freezing.

### Payment and SMS provider abstraction

Order and Payment are **separate aggregates**. An order can be split across
several payments, refunded partially, or paid by a method the gateway knows
nothing about. No gateway logic leaks into the order aggregate.

```
PaymentProvider
├── createPayment()      → providerRef, redirectUrl, settled
├── verifyPayment()      → verified, referenceId
├── refund()
└── getPaymentStatus()
```

`manual` (cash, card terminal, other in-person settlement) always settles
immediately — the money changed hands before the request arrived. `zarinpal`
is a real Iranian gateway implementation: it returns a redirect, the payment
stays `PENDING`, and only the verified callback marks it `PAID`, so an
abandoned redirect never marks an order paid. The callback is idempotent
because gateways retry.

SMS uses the same shape (`send`, `getStatus`, `normalizePhone`) with
`console`, `kavenegar` and `sms_ir` adapters. Delivery runs through a
**transactional outbox**: the message row is persisted first and delivered
after, with quadratic backoff and a cron sweep. A provider outage can delay a
message but can never fail or roll back the order that triggered it.

### Money and time

**Money** is stored as integers in the branch's currency unit (Toman by
default). Integer arithmetic removes floating-point drift from the system
entirely; formatting to `۱۲۵٬۰۰۰ تومان` happens only at the edge. Service
charge applies to the discounted subtotal, then VAT applies to subtotal plus
service charge — matching Iranian invoice practice.

**Time**: every business-day boundary is an Asia/Tehran boundary. A "today's
revenue" figure computed in UTC would be wrong by three and a half hours for
every restaurant on the platform. Prisma stores naive UTC timestamps, so
report queries anchor to UTC before converting
(`("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran'`), and label
components are read back as integers rather than as a timestamp the driver
would re-interpret through the process timezone. Dates are displayed on the
Persian (Jalali) calendar.

---

## API documentation

Interactive Swagger UI runs in development at
**http://localhost:4000/api/docs**. A written reference with request and
response examples lives in [`docs/API.md`](docs/API.md).

Every response uses one of two envelopes:

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }

// failure
{ "success": false, "error": { "code": "ORDER_INVALID_STATE", "message": "…", "details": { } } }
```

Clients branch on the stable `code`, never on the (Persian) message. Internal
details — stack traces, SQL, Prisma errors — are logged server-side and never
reach the client.

---

## Testing

```bash
pnpm test        # 104 unit tests — money, time, state machine, RBAC, isolation guard
pnpm test:e2e    # 206 integration tests against a real PostgreSQL database
```

Integration tests boot the real Nest application and use no mocks, because the
behaviour worth covering — transactions, tenant isolation, the state machine,
money arithmetic — only exists end to end. Each suite truncates the test
database, so tests never depend on each other.

Coverage includes: authentication and refresh-token rotation, the RBAC matrix,
tenant isolation across reads/writes/ordering/reporting/tracking, server-side
pricing and tampering resistance, modifier validation, order-number
concurrency, transaction atomicity, the full state machine, table coupling,
split payments and refunds, customer tracking, reporting correctness,
self-service signup, coupon forgery and usage-limit races under concurrency,
waiter calls, feedback authorisation, category and modifier-group editing, and
image uploads (including a renamed non-image).

---

## Production build

```bash
pnpm build                # builds packages, API and web
pnpm db:migrate:deploy    # apply migrations
pnpm start                # run both production servers
```

Or build the images:

```bash
docker compose --profile app up -d --build
```

Before going live:

- Set strong `JWT_ACCESS_SECRET` and `COOKIE_SECRET` (`openssl rand -base64 48`).
- Set `COOKIE_SECURE=true` and serve over HTTPS.
- Set `COOKIE_DOMAIN` to your apex domain and serve the API under the same
  site (for example `api.example.com`), so the `SameSite=Lax` cookies work.
- Point `APP_URL` at the public frontend origin **before printing QR codes**.
- Configure real `SMS_PROVIDER` and `PAYMENT_PROVIDER` credentials.
- Switch `STORAGE_DRIVER=s3` and provide bucket credentials.
- Do not run the seed; create the first owner account manually.

---

## Future-ready modules

The schema and module boundaries already accommodate these without a rewrite:

| Module | What is already in place |
| --- | --- |
| **Inventory** | Products and order items are separate aggregates; item rows carry captured quantities ready to decrement stock. |
| **Accounting** | Payments are a standalone aggregate with provider references, refunds and an audit trail — the source ledger an accounting module needs. |
| **Delivery** | `OrderType.DELIVERY` and `ServiceMode.DELIVERY` exist and are wired through settings; they need a courier lifecycle, not a schema change. |
| **Loyalty / CRM** | `Customer` already accumulates `ordersCount`, `totalSpent` and `lastOrderAt` per tenant. |
| **Multi-branch** | Branches are first-class throughout: every order, table, menu and staff account is branch-scoped, and sessions can be pinned or switched. |
| **Platform admin** | `Tenant` carries `plan` and `isActive`; the audit log is tenant-scoped and ready for a platform-level console. |
| **More providers** | Adding a payment or SMS provider means implementing one interface and registering it in a factory. |
| **Push / Telegram / WhatsApp** | `NotificationChannel` already enumerates them; `NotificationService` dispatches by channel. |
| **Horizontal scaling** | `REDIS_URL` is wired for a socket.io adapter; the SMS outbox lives in PostgreSQL, so the worker can move to its own process unchanged. |

---

## License

Provided as-is for the commissioning party.
