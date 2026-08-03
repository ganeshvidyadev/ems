# 04 — API Conventions

Every endpoint in the platform follows these rules. Deviations require a note in the PR description explaining why.

---

## 1. URL structure

```
https://api.ems.app/api/v1/{surface}/{resource}[/{publicId}][/{sub-resource}]
```

| Surface | Base | Auth |
|---|---|---|
| Merchant console | `/api/v1/console` | Tenant JWT + RBAC |
| Platform admin | `/api/v1/platform` | Platform JWT + `platform:*` |
| Public storefront | `/api/v1/storefront` | Anonymous or customer JWT |
| Auth | `/api/v1/auth` | Mixed |
| Webhooks | `/api/v1/webhooks/{provider}` | HMAC signature only |
| Public API (merchant integrations) | `/api/v1/public` | API key |

Rules:
- Resources are **plural nouns**: `/products`, `/orders`.
- Path identifiers are always **`public_id` (ULID)**, never the auto-increment PK. Sequential integers in URLs leak business volume (a competitor reading `/orders/1841` learns your order count) and invite enumeration.
- Nesting is one level deep max: `/orders/{id}/refunds` is fine; `/customers/{id}/orders/{id}/items` is not — use `/order-items?orderId=…`.
- Actions that are not CRUD get a sub-resource verb: `POST /orders/{id}/cancel`, `POST /shipments/{id}/schedule-pickup`. Do not overload `PATCH` with a `status` field for state transitions — transitions have their own preconditions, permissions, and side effects, and modelling them as a field hides all three.

**Versioning** is URI-based (`/api/v1`). `v2` ships only for breaking changes, both run in parallel for ≥6 months, and `Sunset`/`Deprecation` headers announce the wind-down. Additive changes never bump the version.

---

## 2. Response envelope

Every response — success and failure — has the same shape. A client that must branch on response *shape* before it can branch on outcome is a client that will mishandle errors.

**Success:**
```json
{
  "success": true,
  "data": { "id": "01J8XQ...", "name": "Blue Shirt" },
  "meta": { "correlationId": "01J8XR...", "timestamp": "2026-08-04T10:23:11.482Z" }
}
```

**Paginated:**
```json
{
  "success": true,
  "data": [ /* … */ ],
  "meta": {
    "pagination": {
      "page": 2, "limit": 25, "total": 1284, "totalPages": 52,
      "hasNext": true, "hasPrev": true
    },
    "correlationId": "01J8XR...",
    "timestamp": "2026-08-04T10:23:11.482Z"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_SKU_DUPLICATE",
    "message": "A product with SKU 'SHIRT-001' already exists.",
    "details": [ { "field": "sku", "code": "duplicate", "message": "Already in use" } ],
    "docsUrl": "https://docs.ems.app/errors/PRODUCT_SKU_DUPLICATE"
  },
  "meta": { "correlationId": "01J8XR...", "timestamp": "2026-08-04T10:23:11.482Z" }
}
```

`correlationId` is on **every** response, including errors. When a merchant reports "it failed at 3pm", that ID is the difference between a two-minute log lookup and an afternoon of guessing.

`error.code` is a stable machine-readable enum from `common/errors/error-codes.enum.ts`. `error.message` is human-facing and may be reworded or localized freely — **clients must branch on `code`, never on `message`.**

---

## 3. HTTP status codes

| Code | Used for |
|---|---|
| 200 | Successful GET / PATCH / PUT / action |
| 201 | Resource created (with `Location` header) |
| 202 | Accepted for async processing (bulk import, report) — body carries a `jobId` |
| 204 | Successful DELETE |
| 400 | Malformed request (bad JSON, bad query param type) |
| 401 | Missing/invalid/expired credentials |
| 402 | Subscription past due — tenant must pay to continue writing |
| 403 | Authenticated but lacks the permission |
| 404 | Not found **or not visible to this tenant** |
| 409 | State conflict (duplicate SKU, already-cancelled order, version mismatch) |
| 410 | Resource permanently gone (expired checkout session) |
| 422 | Semantically invalid payload (failed Zod validation) |
| 423 | Account locked (too many failed logins) |
| 429 | Rate limit exceeded (with `Retry-After`) |
| 500 | Unexpected server error — **never** exposes a stack trace or SQL |
| 502/504 | Upstream gateway/carrier failure |
| 503 | Maintenance or dependency down |

**404 vs 403 for cross-tenant access.** Requesting another tenant's resource returns **404**, not 403. A 403 confirms the resource exists, which is itself an information leak — it lets an attacker enumerate a competitor's order IDs. The rule is: if you cannot see it, it does not exist.

**400 vs 422.** 400 means we could not parse the request; 422 means we parsed it and the values are wrong. Keeping them distinct lets clients distinguish "my serialization is broken" from "the user typed something invalid".

---

## 4. Pagination, sorting, filtering, search

### Pagination

Offset-based by default (merchants expect page numbers):
```
GET /api/v1/console/products?page=2&limit=25
```
`limit` defaults to 25, capped at **100** — an uncapped limit is a denial-of-service vector *and* an accidental data-export channel.

Cursor-based where deep pagination is expected (order exports, log browsing, channel sync):
```
GET /api/v1/console/orders?cursor=eyJpZCI6MTg0MX0&limit=50
```
`OFFSET 50000` makes MySQL walk 50 000 rows to discard them; a cursor (`WHERE id < :lastId`) is an index seek. Endpoints that are paged deeply expose the cursor form.

### Sorting
```
?sort=-createdAt,name
```
Leading `-` is descending. **Only allowlisted fields are sortable** per resource — accepting an arbitrary column name is both an injection surface and an easy way to trigger a full sort of a large table.

### Filtering

Explicit operator suffixes rather than a nested query DSL:
```
?status=ACTIVE                        # equality
?status__in=ACTIVE,DRAFT              # set
?priceMinor__gte=50000                # comparison: gte, gt, lte, lt
?name__like=shirt                     # partial match (anchored server-side)
?createdAt__between=2026-01-01,2026-03-31
?brandId__isnull=true
?tags__contains=summer                 # JSON containment
```

Each resource declares its filterable fields and permitted operators in a `FilterSpec`; anything unrecognized returns **422 with the list of valid filters** rather than being silently dropped. Silent filter-dropping is dangerous: a merchant who filters an export by date and gets everything may act on wrong data without knowing.

### Search
```
?q=blue+cotton+shirt
```
`FULLTEXT` in MVP, swapped for OpenSearch behind `SearchPort` without an API change.

### Field selection
```
?fields=id,name,priceMinor
?include=variants,images,inventory
```
`include` is allowlisted per resource and depth-capped at 2. Uncapped includes let one request assemble an arbitrarily expensive join graph.

---

## 5. Idempotency

Mandatory on all payment-affecting `POST`s: checkout, refund, payout, subscription change.

```
POST /api/v1/storefront/checkout
Idempotency-Key: 01J8XQ9F3K2M7P4R6T8V0W2Y4Z
```

`IdempotencyInterceptor` behaviour:
1. `SET NX` on `idem:{tid}:{key}` with a 24 h TTL.
2. If the key is new → execute, then store `(statusCode, body, requestHash)`.
3. If the key exists and the request body hash **matches** → replay the stored response, do not re-execute.
4. If the key exists and the body hash **differs** → `409 IDEMPOTENCY_KEY_REUSED`.
5. If the original is still in flight → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`.

Step 4 matters: without the body hash, a client that reuses a key for a genuinely different charge would silently receive the old response and believe the second charge succeeded.

Clients should send `Idempotency-Key` on **any** retried mutation. Network timeouts are indistinguishable from failures from the client's side.

---

## 6. Rate limiting

Sliding window in Redis (Lua, atomic), applied at the narrowest matching scope:

| Scope | Limit |
|---|---|
| Per IP — auth endpoints | 5 / min |
| Per IP — OTP request | 3 / 10 min, 10 / day |
| Per IP — storefront | 300 / min |
| Per tenant — Basic | 60 / min |
| Per tenant — Standard | 300 / min |
| Per tenant — Premium | 1 000 / min |
| Per tenant — Enterprise | 5 000 / min |
| Per API key | its configured `rate_limit_per_min` |
| Per tenant — report generation | 10 / hour |
| Per tenant — bulk import | 5 / hour |

Response headers on every request:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1754301600
Retry-After: 34          # on 429 only
```

Returning limit headers on **successful** requests lets well-behaved clients self-throttle before they get rejected — the point of a rate limit is to shape traffic, not to punish it.

---

## 7. Authentication flows

### Standard login
```
POST /api/v1/auth/login          { email, password, tenantSlug? }
  → 200 { accessToken, expiresIn, user }        + refresh cookie (httpOnly)
  → 200 { mfaRequired: true, mfaToken }         if MFA is enabled
  → 423 ACCOUNT_LOCKED                          after 5 failures (15 min lock)
```

### Token refresh
```
POST /api/v1/auth/refresh        (refresh cookie)
  → 200 { accessToken, expiresIn }  + rotated refresh cookie
  → 401 REFRESH_TOKEN_REUSED        → entire token family revoked
```

### OTP login
```
POST /api/v1/auth/otp/request    { identifier }        → 200 { otpToken, expiresIn: 300 }
POST /api/v1/auth/otp/verify     { otpToken, code }    → 200 { accessToken, ... }
```
The OTP response is **identical whether or not the account exists** — a differing response is a user-enumeration oracle. Same principle applies to `/auth/forgot-password`, which always returns 200.

### Full endpoint set
`POST /register` · `POST /login` · `POST /logout` · `POST /logout-all` · `POST /refresh` · `POST /verify-email` · `POST /resend-verification` · `POST /forgot-password` · `POST /reset-password` · `POST /change-password` · `POST /otp/request` · `POST /otp/verify` · `POST /mfa/enable` · `POST /mfa/verify` · `POST /mfa/disable` · `POST /mfa/recovery-codes` · `GET /me` · `GET /sessions` · `DELETE /sessions/{id}`

---

## 8. Representative endpoint surface

Abbreviated — full detail lives in Swagger. `C` = console, `S` = storefront, `P` = platform.

### Products
```
C   GET    /console/products                    list, filter, sort, search
C   POST   /console/products
C   GET    /console/products/{id}
C   PATCH  /console/products/{id}
C   DELETE /console/products/{id}               soft delete
C   POST   /console/products/{id}/duplicate
C   POST   /console/products/bulk               bulk create/update → 202 { jobId }
C   PATCH  /console/products/bulk-status        bulk publish/archive
C   POST   /console/products/import             CSV/XLSX upload → 202
C   GET    /console/products/export             → 202 { jobId }
C   GET    /console/products/{id}/variants
C   POST   /console/products/{id}/variants
C   POST   /console/products/{id}/media
C   PATCH  /console/products/{id}/media/reorder
S   GET    /storefront/products                 published + visible only
S   GET    /storefront/products/{slug}
S   GET    /storefront/products/{slug}/related
```

### Orders
```
C   GET    /console/orders
C   GET    /console/orders/{id}
C   POST   /console/orders                      manual/phone order
C   POST   /console/orders/{id}/confirm
C   POST   /console/orders/{id}/cancel          { reason, restock }
C   POST   /console/orders/{id}/refund          Idempotency-Key required
C   POST   /console/orders/{id}/fulfil          { items[], warehouseId }
C   GET    /console/orders/{id}/invoice         → PDF
C   GET    /console/orders/{id}/packing-slip    → PDF
C   POST   /console/orders/{id}/notes
C   GET    /console/orders/{id}/timeline        status history + events
S   POST   /storefront/checkout                 Idempotency-Key required
S   GET    /storefront/orders                   customer's own orders
S   POST   /storefront/orders/{id}/cancel
S   POST   /storefront/orders/{id}/return
```

### Inventory
```
C   GET    /console/inventory                   filter by warehouse/low-stock
C   PATCH  /console/inventory/{id}              { quantityOnHand, reason }
C   POST   /console/inventory/adjust            bulk adjustment with reason
C   POST   /console/inventory/transfer          warehouse → warehouse
C   GET    /console/inventory/movements         ledger
C   GET    /console/inventory/low-stock
C   POST   /console/inventory/count             stock-take reconciliation
```

### Marketplace
```
C   GET    /console/marketplace/catalog                 browsable shared products
C   POST   /console/marketplace/share-requests          reseller asks supplier
C   GET    /console/marketplace/share-requests
C   POST   /console/marketplace/share-requests/{id}/approve
C   POST   /console/marketplace/share-requests/{id}/reject
C   GET    /console/marketplace/shared-products         supplier view
C   PATCH  /console/marketplace/shares/{id}             commission, pricing
C   DELETE /console/marketplace/shares/{id}             revoke
C   GET    /console/marketplace/commissions             ledger
C   GET    /console/marketplace/settlements
C   GET    /console/marketplace/settlements/{id}/report → PDF/CSV
P   POST   /platform/settlements/generate               period batch
P   POST   /platform/settlements/{id}/approve
P   POST   /platform/settlements/{id}/pay
```

### Platform admin
```
P   GET    /platform/tenants
P   GET    /platform/tenants/{id}
P   POST   /platform/tenants/{id}/suspend      { reason }
P   POST   /platform/tenants/{id}/reactivate
P   POST   /platform/tenants/{id}/impersonate  audited, time-boxed token
P   GET    /platform/plans        POST/PATCH
P   GET    /platform/templates    POST/PATCH
P   GET    /platform/domains      POST /{id}/verify   POST /{id}/reissue-ssl
P   GET    /platform/logs/api     ?tenantId&statusCode&route&from&to
P   GET    /platform/logs/errors
P   GET    /platform/logs/auth
P   GET    /platform/queues                     depth, failure counts
P   POST   /platform/queues/{name}/retry-failed
P   GET    /platform/analytics/overview         MRR, churn, tenant growth
```

### Webhooks (inbound)
```
POST /webhooks/razorpay   /stripe   /paypal   /cashfree   /phonepe
POST /webhooks/delhivery  /shiprocket  /bluedart
POST /webhooks/amazon     /flipkart    /meta
```
Each verifies its provider's signature scheme, enforces a ±5 min timestamp window, dedupes on the provider's event ID, and **returns 200 immediately** after enqueueing. Processing inline would mean a slow database write causes the provider to time out and redeliver, multiplying load exactly when the system is already struggling.

---

## 9. Swagger / OpenAPI

Served at `/api/docs` (Basic-auth protected outside dev), spec at `/api/docs-json`.

- Grouped by surface tag: `Auth`, `Console: Products`, `Storefront`, `Platform`, `Webhooks`.
- DTOs are generated from the Zod schemas in `packages/contracts` via `zod-to-openapi`, so **docs cannot drift from validation** — the same object is both.
- Every endpoint documents: description, permission required, all possible error codes, request/response examples, and rate-limit tier.
- The spec is committed on release and diffed in CI: an unintended breaking change (removed field, narrowed enum, new required property) fails the build.

---

## 10. Global error-code registry

Namespaced `{DOMAIN}_{CONDITION}`. Non-exhaustive:

| Code | Status |
|---|---|
| `VALIDATION_FAILED` | 422 |
| `AUTH_INVALID_CREDENTIALS` | 401 |
| `AUTH_TOKEN_EXPIRED` | 401 |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 |
| `AUTH_ACCOUNT_LOCKED` | 423 |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 |
| `AUTH_MFA_REQUIRED` | 200 |
| `PERMISSION_DENIED` | 403 |
| `TENANT_SUSPENDED` | 403 |
| `SUBSCRIPTION_PAST_DUE` | 402 |
| `PLAN_QUOTA_EXCEEDED` | 402 |
| `RESOURCE_NOT_FOUND` | 404 |
| `RESOURCE_CONFLICT` | 409 |
| `VERSION_MISMATCH` | 409 |
| `PRODUCT_SKU_DUPLICATE` | 409 |
| `INVENTORY_INSUFFICIENT` | 409 |
| `ORDER_NOT_CANCELLABLE` | 409 |
| `ORDER_ALREADY_FULFILLED` | 409 |
| `PAYMENT_GATEWAY_ERROR` | 502 |
| `PAYMENT_ALREADY_CAPTURED` | 409 |
| `REFUND_EXCEEDS_PAYMENT` | 422 |
| `COUPON_EXPIRED` | 422 |
| `COUPON_USAGE_LIMIT_REACHED` | 422 |
| `COUPON_NOT_ELIGIBLE` | 422 |
| `SHIPPING_CARRIER_ERROR` | 502 |
| `SHIPPING_PINCODE_UNSERVICEABLE` | 422 |
| `DOMAIN_ALREADY_TAKEN` | 409 |
| `DOMAIN_VERIFICATION_FAILED` | 422 |
| `CHANNEL_TOKEN_EXPIRED` | 409 |
| `IDEMPOTENCY_KEY_REUSED` | 409 |
| `RATE_LIMIT_EXCEEDED` | 429 |
| `INTERNAL_ERROR` | 500 |

Each code maps to a docs page. `PLAN_QUOTA_EXCEEDED` additionally returns `details: { limitKey, current, max, upgradeUrl }` — an error that tells the merchant exactly which cap they hit and how to lift it converts, where a bare 402 generates a support ticket.

---

## 11. Testing standards

| Layer | Tool | What it covers | Gate |
|---|---|---|---|
| Unit | Jest | Domain aggregates, value objects, pure services. No I/O, no DB. | ≥90 % on `domain/` |
| Integration | Jest + Testcontainers (real MySQL/Redis/Mongo) | Repositories, transactions, outbox, cache invalidation | ≥75 % on `infrastructure/` |
| Contract | Jest + Zod | Every controller's request/response validates against its `contracts` schema | 100 % of endpoints |
| **Tenant isolation** | Jest + Supertest | Tenant A's token against tenant B's resources across every console/storefront route → expect 404 | **100 %, blocking** |
| E2E | Playwright | Signup → plan → template → provisioning → product → checkout → fulfil | Critical paths |
| Load | k6 | Checkout at 500 rps; flash-sale inventory contention | Pre-release |
| Security | `pnpm audit`, Trivy, OWASP ZAP baseline | Deps, images, headers | Per PR / nightly |

**Mocking policy:** never mock the database in integration tests. Testcontainers gives a real MySQL, which is the only way to catch the bugs that actually happen — FK violations, unique-constraint races, transaction isolation surprises, generated-column behaviour. A mocked repository tests the mock.

Every third-party integration ships a **recorded-fixture test** (real captured gateway/carrier payloads) plus a failure-mode test (timeout, 500, malformed response, signature mismatch). Integrations fail in production most often on the unhappy path, so the unhappy path is where the tests go.

---

**Next:** [05 — Roadmap](./05-roadmap.md)
