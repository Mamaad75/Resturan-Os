# FoodOS — API reference

Base URL: `http://localhost:4000/api`
Interactive Swagger UI (development): `http://localhost:4000/api/docs`

---

## Conventions

### Response envelope

Every response is one of two shapes.

```jsonc
// Success
{
  "success": true,
  "data": { /* payload */ }
}

// Success, paginated — `data` is the array, `meta` carries the page info
{
  "success": true,
  "data": [ /* items */ ],
  "meta": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7 }
}

// Failure
{
  "success": false,
  "error": {
    "code": "ORDER_INVALID_STATE",
    "message": "تغییر وضعیت از «ارسال به آشپزخانه» به «تکمیل شده» مجاز نیست…",
    "details": { "items.0.quantity": ["حداقل مقدار ۱ است."] }
  }
}
```

Branch on `error.code`. The `message` is Persian and written for end users;
`details` is present only for validation failures and is keyed by dotted
field path.

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | Payload failed schema validation; see `details` |
| `UNAUTHENTICATED` | 401 | No or unusable credentials |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `TOKEN_EXPIRED` | 401 | Access or refresh token expired — refresh and retry |
| `TOKEN_INVALID` | 401 | Malformed or forged token |
| `FORBIDDEN` | 403 | Authenticated, but the role lacks the permission |
| `NOT_FOUND` | 404 | Missing, **or owned by another tenant** |
| `CONFLICT` | 409 | Duplicate value or dependent records |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `ORDER_INVALID_STATE` | 409 | Transition not permitted for this order type |
| `ORDER_EMPTY` | 422 | Order has no items |
| `ORDER_ALREADY_PAID` | 409 | Order is fully settled |
| `PRODUCT_UNAVAILABLE` | 409 | Product is marked unavailable |
| `MODIFIER_INVALID` | 422 | Modifier missing, not permitted, or from another product |
| `TABLE_UNAVAILABLE` | 409 | Table is disabled |
| `SERVICE_MODE_DISABLED` | 409 | Order type not enabled, or branch closed |
| `PAYMENT_INVALID_STATE` | 409 | Payment cannot move to that state |
| `PAYMENT_AMOUNT_MISMATCH` | 422 | Amount exceeds the outstanding balance |
| `PAYMENT_PROVIDER_ERROR` | 502/503 | Gateway unreachable or not configured |
| `INTERNAL_ERROR` | 500 | Unexpected failure (details are logged, not returned) |

A resource belonging to another tenant returns **404, not 403** — a 403 would
confirm the record exists.

### Authentication

Login sets two httpOnly cookies and also returns the access token in the body
(the WebSocket handshake needs it explicitly).

- `ros_access` — JWT, 15 minutes by default, `Path=/`
- `ros_refresh` — opaque, 30 days by default, `Path=/api/auth`

Send either the cookie or `Authorization: Bearer <token>`. On
`TOKEN_EXPIRED`, call `POST /auth/refresh` once and retry; refresh tokens
rotate, so a stolen cookie works at most once before it stops working.

### Money

All amounts are **integers** in the branch's currency unit (Toman by
default). `150000` means ۱۵۰٬۰۰۰ تومان. There are no decimals anywhere in the
API.

---

## Public endpoints (no authentication)

These back the QR menu and the customer tracking page.

### `GET /public/restaurants/:slug/menu`

Live menu for a restaurant. Menu content is always fetched fresh, which is why
a printed QR code never goes stale.

| Query | Type | Notes |
| --- | --- | --- |
| `table` | integer | Table number from the QR path; resolves table context |

```bash
curl 'http://localhost:4000/api/public/restaurants/cafe-roz/menu?table=7'
```

```jsonc
{
  "success": true,
  "data": {
    "restaurant": {
      "name": "کافه رُز",
      "slug": "cafe-roz",
      "branding": { "accentColor": "#C9A24B", "theme": "dark", "tagline": "…" },
      "settings": {
        "serviceModes": ["DINE_IN", "TAKEAWAY"],
        "currency": "IRT",
        "taxEnabled": true, "taxRateBps": 900,
        "serviceChargeEnabled": true, "serviceChargeBps": 1000,
        "estimatedPrepMinutes": 20
      },
      "branch": { "name": "شعبه مرکزی", "isOpen": true, "phone": "02188776655" },
      "table": { "id": "…", "number": 7, "name": null }
    },
    "categories": [
      {
        "nameFa": "برگر",
        "products": [
          {
            "id": "…",
            "nameFa": "چیزبرگر",
            "price": 320000,
            "discountPrice": 285000,
            "effectivePrice": 285000,   // computed server-side
            "isAvailable": true,
            "modifierGroups": [
              {
                "nameFa": "افزودنی‌ها",
                "type": "MULTIPLE",
                "isRequired": false,
                "minSelect": 0, "maxSelect": 4,
                "options": [{ "id": "…", "nameFa": "پنیر اضافه", "priceDelta": 35000 }]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### `POST /public/restaurants/:slug/orders`

Submit a customer order. Rate limited (`THROTTLE_PUBLIC_ORDER_LIMIT`,
default 12/min).

**The request carries no prices.** Send product ids, quantities and chosen
modifier ids; the server computes every amount from the live menu. Any
`price`, `total` or `discount` field in the request is ignored.

```jsonc
{
  "type": "DINE_IN",                    // or "TAKEAWAY"
  "tableId": "…",                       // required for DINE_IN
  "customerName": "محمد تهرانی",         // required for TAKEAWAY
  "customerPhone": "09351234567",       // required for TAKEAWAY; normalised
  "notes": "لطفاً کم‌شیرین",
  "items": [
    { "productId": "…", "quantity": 2, "notes": "داغ", "modifierOptionIds": ["…"] }
  ]
}
```

Response `201` returns the created order, the tracking token and a ready-made
tracking URL:

```jsonc
{
  "success": true,
  "data": {
    "order": { "orderNumber": "1429", "status": "SENT_TO_KITCHEN", "total": 809325, "…": "…" },
    "trackingToken": "9f3c…",
    "trackingUrl": "http://localhost:3000/order/track/9f3c…"
  }
}
```

Phone numbers are normalised: `+98 912 123 4567`, `00989121234567` and
`۰۹۱۲۱۲۳۴۵۶۷` all become `09121234567`.

### `GET /public/orders/track/:token`

Customer tracking. The unguessable 48-character token **is** the authorisation
check: it grants access to exactly one order and cannot be used to enumerate
others. The payload is deliberately narrow — no internal ids, no staff names,
no payment references.

### `GET /public/orders/track/:token/notifications`

In-app notifications raised for that order.

### `POST /public/orders/track/:token/feedback`

One rating (1–5) plus an optional comment per order. The tracking token is the
credential, so only the person who placed the order can rate it. Rating an
order that has not been served yet is rejected — it would measure nothing.

### `POST /public/restaurants/:slug/waiter-call`

A seated guest asks for assistance, the bill, or supplies. Repeat taps return
the existing open call (`alreadyOpen: true`) instead of creating a second one,
so the floor view cannot be flooded.

### `POST /public/restaurants/:slug/coupons/preview`

Checks a discount code against a subtotal before checkout and returns the
amount it would take off. Advisory only: the discount is recomputed and
claimed server-side when the order is actually created.

### `GET /public/signup/slug-available`

Live availability check for a public address while the owner types it.

### `POST /public/signup`

Creates a tenant, restaurant, branch, menu, starter categories, the owner
account and the restaurant QR code in one transaction, then returns a signed-in
session. VAT is off by default — an operator turns it on deliberately.

### `POST /public/payments/verify`

Gateway return path for online payments. Idempotent — gateways retry, and
verifying an already-paid payment reports success again.

---

## Authentication

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/login` | Sign in; sets cookies, returns session |
| `POST` | `/auth/refresh` | Rotate the refresh token, issue a new access token |
| `POST` | `/auth/logout` | Revoke the session and clear cookies |
| `GET` | `/auth/me` | Current user, tenant and accessible branches |
| `POST` | `/auth/switch-branch` | Re-issue a token pinned to another branch |
| `POST` | `/auth/change-password` | Change own password; revokes all other sessions |

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@caferoz.ir","password":"Owner12345"}'
```

`tenantSlug` is optional and only needed when one email exists in more than
one tenant (email is unique per tenant, not globally).

---

## Orders

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/orders` | `order:read` |
| `POST` | `/orders` | `order:create` |
| `GET` | `/orders/:id` | `order:read` |
| `PATCH` | `/orders/:id` | `order:update` |
| `PATCH` | `/orders/:id/status` | `order:status_update` / `kitchen:update` / `order:cancel` |
| `POST` | `/orders/:id/items` | `order:update` |
| `GET` | `/orders/kitchen/queue` | `kitchen:read` |

`GET /orders` filters: `page`, `pageSize`, `status` (comma-separated), `type`,
`paymentStatus`, `tableId`, `search` (order number, customer name or phone),
`from`, `to`, `activeOnly`.

### `PATCH /orders/:id/status`

```jsonc
{ "status": "PREPARING", "note": "شروع شد" }
```

Rejected transitions return `409 ORDER_INVALID_STATE` and name the permitted
next states. `COMPLETED` is refused while the order is unpaid. Every order
carries `allowedTransitions`, so clients render only valid actions.

---

## Payments

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/orders/:id/payment` | `payment:read` |
| `POST` | `/orders/:id/payment` | `payment:create` |
| `POST` | `/orders/:id/payment/refund` | `payment:refund` |

```jsonc
// Omit `amount` to settle the entire outstanding balance.
{ "method": "CARD", "amount": 400000, "reference": "123456" }
```

Cash and card settle immediately. `ONLINE` returns a `redirectUrl` and stays
`PENDING` until the gateway callback verifies it. Partial payments are
supported: the order stays `PENDING` until `paidTotal` reaches `total`.

---

## Menu

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/menu` | `menu:read` |
| `GET` | `/categories` | `menu:read` |
| `POST` | `/categories` | `category:manage` |
| `PATCH` | `/categories/:id` | `category:manage` |
| `DELETE` | `/categories/:id` | `category:manage` |
| `POST` | `/categories/reorder` | `category:manage` |
| `GET` | `/products` | `product:read` |
| `POST` | `/products` | `product:manage` |
| `GET` | `/products/:id` | `product:read` |
| `PATCH` | `/products/:id` | `product:manage` |
| `PATCH` | `/products/:id/availability` | `product:manage` / `kitchen:update` |
| `DELETE` | `/products/:id` | `product:manage` |
| `POST` | `/products/reorder` | `product:manage` |

Deleting a product that has been sold is safe: order items keep their own copy
of the name and price, so history and reports stay correct. A category with
products cannot be deleted (`409`) — hide it instead.

`modifierGroups` on a product write replaces every group wholesale, options
included: send the full list to change one option, and send `[]` to remove all
of them. Omitting the field leaves the existing groups untouched.

---

## Menu templates

`PATCH /restaurant/branding` accepts `menuTemplate` alongside the colours and
logo. Valid values: `CLASSIC`, `TRADITIONAL`, `CAFE`, `FASTFOOD`, `MINIMAL`.

The column is a plain string, not a database enum, so a new template ships
without a migration and a template that is later retired does not strand the
restaurants that chose it — an unrecognised value resolves to `CLASSIC` on
read. Anything not currently in the list is rejected on write.

A template controls layout only. The accent colour, logo, cover image and
light/dark setting belong to the restaurant and are never changed by switching
template — each template does carry a suggested palette in
`MENU_TEMPLATE_SPECS` (`@restaurant-os/types`), but the admin offers it as an
explicit one-click action rather than applying it. A brand-new restaurant gets
its business type's palette at signup, when there is no choice yet to preserve.

The public menu payload carries the resolved value under
`restaurant.branding.menuTemplate`.

---

## Tables, QR, staff, settings

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/tables` | `table:read` |
| `POST` | `/tables` | `table:manage` |
| `POST` | `/tables/bulk` | `table:manage` |
| `PATCH` | `/tables/:id` | `table:manage` |
| `DELETE` | `/tables/:id` | `table:manage` |
| `GET` | `/qr` | `qr:manage` |
| `POST` | `/qr/sync` | `qr:manage` |
| `GET` | `/qr/print-sheet` | `qr:manage` |
| `GET` | `/qr/:id/svg` · `/qr/:id/png` | `qr:manage` |
| `DELETE` | `/qr/:id` | `qr:manage` |
| `GET` | `/staff` | `staff:read` |
| `POST` | `/staff` | `staff:manage` |
| `PATCH` | `/staff/:id` | `staff:manage` |
| `POST` | `/staff/:id/reset-password` | `staff:manage` |
| `DELETE` | `/staff/:id` | `staff:manage` |
| `GET` | `/restaurant` | `settings:read` / `menu:read` |
| `PATCH` | `/restaurant` | `settings:manage` |
| `PATCH` | `/restaurant/branding` | `branding:manage` |
| `PATCH` | `/restaurant/settings` | `settings:manage` |
| `GET`/`PATCH` | `/restaurant/branches[/:id]` | `settings:read` / `branch:manage` |

`POST /qr/sync` is idempotent: it creates only the codes that are missing, so
already-printed cards stay valid.

Deleting a staff member soft-disables the account and revokes its sessions —
orders and audit rows reference it, and that history is worth more than the
row. The last active owner cannot be removed or demoted.

---

## Coupons, waiter calls, feedback

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/coupons` | `report:read` / `settings:manage` |
| `POST` | `/coupons` | `settings:manage` |
| `PATCH` | `/coupons/:id` | `settings:manage` |
| `DELETE` | `/coupons/:id` | `settings:manage` |
| `GET` | `/waiter-calls` | `table:read` / `order:read` |
| `PATCH` | `/waiter-calls/:id` | `table:manage` / `order:update` |
| `GET` | `/feedback` | `report:read` |

A coupon that has already been redeemed is deactivated rather than deleted, so
the discount on a historical order stays explainable.

Redemption is claimed with a conditional `UPDATE … WHERE usageCount <
usageLimit` inside the order transaction. Under `READ COMMITTED` a
read-then-write would let simultaneous customers overshoot a usage limit; the
conditional update cannot.

---

## Reports and dashboard

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/dashboard` | `report:read` |
| `GET` | `/reports/sales` | `report:read` |
| `GET` | `/reports/hourly` | `report:read` |

Query: `preset` (`today`, `yesterday`, `week`, `month`, `custom`), `from`,
`to`, `granularity` (`hour`, `day`, `week`, `month`), `branchId`.

All buckets are **Asia/Tehran** day and hour boundaries. Revenue counts orders
that are not cancelled **and** have `paymentStatus = PAID` — an unpaid order
sitting on a table is not revenue yet.

`/reports/sales` returns `totals`, `breakdown.byOrderType`,
`breakdown.byPaymentMethod`, `series`, `topProducts`, `topCategories` and
`peakHours`.

---

## Notifications, SMS, audit, uploads

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/notifications` | authenticated |
| `POST` | `/notifications/read` | authenticated |
| `GET` | `/sms` | `settings:read` |
| `GET` | `/audit` | `audit:read` |
| `POST` | `/uploads/image` | `product:manage` / `branding:manage` |

`POST /uploads/image` takes `multipart/form-data` with a `file` field (max
8 MB, JPEG/PNG/WebP/AVIF). Images are re-encoded to WebP — which also strips
metadata and rejects renamed non-images — and returned as `url` plus
`thumbnailUrl`. Uploads are namespaced per tenant.

---

## WebSocket

Namespace `/realtime` on the API origin.

```js
// Staff
io('http://localhost:4000/realtime', { auth: { token: accessToken } });

// Customer — bound to exactly one order
io('http://localhost:4000/realtime', { auth: { trackingToken } });
```

On success the server emits `connected`; on failure, `unauthorized` followed
by a disconnect.

| Event | Delivered to |
| --- | --- |
| `order.created` | Branch and kitchen rooms |
| `order.updated` | Branch, kitchen and that order's room |
| `order.status_changed` | Branch, kitchen and that order's room |
| `payment.updated` | Branch and that order's room |
| `table.updated` | Branch room |
| `notification.created` | The specific user, or that order's room |
| `waiter.called` | Branch room (floor staff, not the kitchen) |
| `waiter.call_resolved` | Branch room |

Staff join the kitchen room only if their role carries `kitchen:read`.
Customers join a single order room and never receive branch traffic.

---

## Rate limits

| Scope | Default | Variable |
| --- | --- | --- |
| Global | 300 / minute | `THROTTLE_LIMIT` |
| `POST /auth/login` | 10 / minute | `THROTTLE_AUTH_LIMIT` |
| `POST /public/…/orders` | 12 / minute | `THROTTLE_PUBLIC_ORDER_LIMIT` |
| `GET /public/…/menu` | 240 / minute | fixed |

Exceeding a limit returns `429` with `RATE_LIMITED`.
