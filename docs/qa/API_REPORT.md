# EMS — API Report (QA Phase 5: API Testing)

**Phase:** 5 — API testing (business-critical routes, real HTTP against the live server)
**Executed:** 2026-09-08, live against the running dev stack
**Environment:** API `http://localhost:4000/api/v1` · MySQL `127.0.0.1:3307` db `ems` (native Windows install)
**Method:** Direct HTTP requests (curl) with real captured JWTs (`POST /api/v1/auth/login`). No code review substituted for a live request/response. Console/API calls are tenant-scoped via the JWT's `tid` claim (see `apps/api/src/common/middleware/tenant-resolver.middleware.ts` — console never trusts a header for tenant, only the verified JWT), so no `Host`/`x-ems-hostname` header is needed for `console/*` routes; storefront routes are tenant-scoped by `Host`/`x-ems-hostname` and are called with `x-ems-hostname: northwind.ems.localhost`.
**Out of scope (covered elsewhere, not re-run in depth here):** tenant isolation / cross-tenant leaks (Phase 6, `SECURITY_REPORT.md`), RBAC permission matrix (Phase 6, `PERMISSION_MATRIX.md`), frontend/UI (Phases 3/4, `BUG_REPORT.md`), concurrency/races (Phase 8), load/performance (Phase 9), anything needing Docker/SMTP/MinIO/queue-Redis (`QA_REPORT.md` §5 — BLOCKED).

Per the QA charter, every result uses exactly one of `PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`, `NOT TESTED`, `SKIPPED`. Nothing is silently converted to PASS. Test data created for this phase is prefixed `QA-API-`.

---

## 0. Summary

| Severity | Count | IDs |
|---|---|---|
| **P0** | **0** | — |
| **P1** | **1** | BUG-API-001 |
| **P2** | **0 new** | KF-07 reconfirmed still open (already tracked, not double-counted) |
| **P3** | **0** | — |
| **Total new bugs** | **1** | |

**Endpoints/scenarios exercised:** ~39 distinct routes, ~85 individual request/response scenarios (see §2 for the full itemized log), covering the full order lifecycle end-to-end (place→confirm→fulfil→ship→complete, plus hold/resume/cancel/refund), product/coupon/customer/review/inventory CRUD and validation, cart+checkout pricing parity, and a support-ticket cross-tenant spot-check.

**Headline result: no P0.** Every money figure re-checked was exact to the paisa (the COD-fee preview/placed-order parity, the 100%-coupon clamp-to-zero), and the order state machine journaled every transition correctly except for one gap (BUG-API-001). Three previously-open findings were re-verified fixed at the API level (BUG-FE-018's fulfil→ORDER-event gap, BUG-FE-011's COD-fee preview/placement mismatch, BUG-FE-010's coupon percentage bound — plus SEC-001's tenant isolation fix, spot-checked). One previously-open finding (KF-07) is reconfirmed still present, exactly as documented — no new diagnosis was needed.

**Severity bar** (same as `BUG_REPORT.md`/`SECURITY_REPORT.md`): P0 = data corruption, security, or a broken checkout/payment path. P1 = a core task cannot be completed, or a state-machine/data-integrity invariant is violated. P2 = a feature is partially broken or validation is wrong. P3 = minor/cosmetic.

---

## 1. Test accounts and setup

| Account | Role | Tenant | Perms |
|---|---|---|---|
| `owner@northwind.test` | STORE_OWNER | northwind (`01M1VYDRBXZ959TXST7ZT1FTB4`) | 160 (full) |
| `ops@northwind.test` | ORDER_MANAGER | northwind | 22 |

Login confirmed live:

```http
POST /api/v1/auth/login
{"email":"owner@northwind.test","password":"DemoPassword123!"}
-> 200 {"success":true,"data":{"outcome":"AUTHENTICATED","accessToken":"...","user":{...,"tenant":{"slug":"northwind"}}}}
```

Both tokens captured and reused for the rest of this phase (`Authorization: Bearer <token>`).

---

## 2. Test log

### 2.1 Products — CRUD, list/filter/sort/pagination, validation

| # | Check | Result | Evidence |
|---|---|---|---|
| P-01 | `POST /console/products` valid create | **PASS** | `201`, product `01M20E0ADTTP4MACRPG9YVKVA6` created, `status:"DRAFT"` |
| P-02 | `GET /console/products/:id` | **PASS** | `200`, full product returned |
| P-03 | `PUT /console/products/:id` update price+name | **PASS** | `200`, `updatedAt` bumped |
| P-04 | `DELETE /console/products/:id` (soft delete, regression check for fixed KF-03) | **PASS** | `204`, then `GET` on same id → `404 RESOURCE_NOT_FOUND` (no `MissingDeleteDateColumnError` 500) |
| P-05 | List filter `status=DRAFT` | **PASS** | `meta.pagination.total:13` (subset of all 29) |
| P-06 | Sort `sort=priceMinor` (ascending) | **PASS** | `["1000","1000","1000"]` (increasing) |
| P-07 | Sort `sort=-priceMinor` (descending) | **PASS** | `["2299900","2149900","1749900"]` (decreasing) |
| P-08 | Sort with bad syntax `sort=priceMinor:asc` | **PASS** | `422 VALIDATION_FAILED`, names sortable fields in the message — not a 500 |
| P-09 | Create with negative price `"-500"` | **PASS** | `422`, `{field:"priceMinor", message:"Must be a non-negative integer string"}` |
| P-10 | Create with missing `name` | **PASS** | `422`, `{field:"name", code:"invalid_type", message:"Required"}` |
| P-11 | Create with `priceMinor` as a JSON number instead of string | **PASS** | `422`, `{field:"priceMinor", message:"Expected string, received number"}` |
| P-12 | Create with empty-string `name` | **PASS** | `422`, `"Name is required"` |
| P-13 | Create with 600-char `name` (max 500) | **PASS** | `422`, `"Must be at most 500 characters"` |
| P-14 | Create with emoji in `name` (`"QA-API 🎉 Emoji Product"`) | **PASS** | `201` — unicode/emoji accepted correctly, no mangling |
| P-15 | Create with malformed `storeId` (`"not-a-ulid"`) | **PASS** | `422`, two stacked `details` entries (`too_small` + `invalid_format`), no 500 |
| P-16 | `GET /console/products/:id` for a well-formed but nonexistent ULID | **PASS** | `404 RESOURCE_NOT_FOUND` |
| P-17 | `GET /console/products/:id` for a garbage string (`not-a-valid-ulid`) | **PASS** | `404 RESOURCE_NOT_FOUND` (not 400/500 — malformed and nonexistent ids are handled identically and safely) |

No bugs found in products. All validation is enforced server-side with a consistent `422`/`{success:false,error:{code,message,details}}` shape, and no path produced a `500`.

### 2.2 Orders — full lifecycle, timeline events, error paths

Built one real order end-to-end through the public checkout (`storefront/cart` → `storefront/checkout/pricing` → `storefront/checkout/orders`, COD), then drove it through the console lifecycle.

| # | Check | Result | Evidence |
|---|---|---|---|
| O-01 | Place COD order | **PASS** | `201`, `ORD-000032` / `01M20E5YC20YAH58NX4HEKGSVT`, `total: 2879.00`, auto-`CONFIRMED` |
| O-02 | **Re-verify BUG-FE-018 fix**: `fulfil` writes both a `FULFILMENT` and an `ORDER` timeline event | **PASS** | See full evidence below — timeline shows `ORDER:CONFIRMED→SHIPPED` immediately after `FULFILMENT:UNFULFILLED→FULFILLED`, same timestamp second |
| O-03 | `close` → `COMPLETED` | **PASS** | Timeline ends `ORDER:SHIPPED→COMPLETED` |
| O-04 | `hold` → `ON_HOLD`, then `resume` → back to prior status (`CONFIRMED`) | **PASS** | `hold` response `{"status":"ON_HOLD"}`; `resume` response `{"status":"CONFIRMED"}` |
| O-05 | `cancel` with reason | **PASS** | `{"status":"CANCELLED","cancelReason":"QA-API cancel test"}` |
| O-06 | Cancel an already-cancelled order | **PASS** | `409 ORDER_NOT_CANCELLABLE`, `"Order cannot be cancelled from status 'CANCELLED'"` — no 500 |
| O-07 | `fulfil` with an `orderItemId` that doesn't exist | **PASS** | `404 RESOURCE_NOT_FOUND` |
| O-08 | `fulfil` a quantity greater than what's open | **PASS** | `422 BUSINESS_RULE_VIOLATION`, `"Cannot fulfil 999 of order item 34; only 1 are open"` |
| O-09 | **`fulfil` a `CANCELLED` order** | **FAIL — see BUG-API-001** | `201` succeeded; order ends up `status:"CANCELLED"`, `fulfilmentStatus:"FULFILLED"` |
| O-10 | `refund` an order with no captured payment (COD, `paymentStatus:"PENDING"`) | **PASS** | `404`, `"Capturable payment for this order not found"` — sane, not a 500 |
| O-11 | Idempotency-Key enforcement on order placement | **PASS** | Omitting the header → `400 MALFORMED_REQUEST`, `"This request requires an Idempotency-Key header"` |
| O-12 | Idempotency-Key correctness: same key, same request, sent twice | **PASS** | Both calls returned the identical `orderId`/`orderNumber` — no duplicate order created |
| O-13 | `GET /console/orders/:id` malformed id / nonexistent id | **PASS** | Both `404 RESOURCE_NOT_FOUND`, consistent with products |

**Full timeline evidence for O-02 (BUG-FE-018 re-verification), order `01M20E5YC20YAH58NX4HEKGSVT`:**

```json
[
 {"statusType":"ORDER","fromStatus":null,"toStatus":"PENDING","actorType":"CUSTOMER","createdAt":"2026-09-08T11:59:13.811Z"},
 {"statusType":"ORDER","fromStatus":"PENDING","toStatus":"CONFIRMED","actorType":"SYSTEM","createdAt":"2026-09-08T11:59:13.840Z"},
 {"statusType":"FULFILMENT","fromStatus":"UNFULFILLED","toStatus":"FULFILLED","actorType":"USER","createdAt":"2026-09-08T12:00:07.545Z"},
 {"statusType":"ORDER","fromStatus":"CONFIRMED","toStatus":"SHIPPED","actorType":"USER","createdAt":"2026-09-08T12:00:07.549Z"}
]
```

Request that produced it:

```http
POST /api/v1/console/orders/01M20E5YC20YAH58NX4HEKGSVT/fulfil HTTP/1.1
Authorization: Bearer <owner@northwind.test>
Content-Type: application/json

{"items":[{"orderItemId":"33","quantity":1}],"awbNumber":"QA-API-AWB-001","notifyCustomer":false}
```

Fix confirmed live: the previously-missing `ORDER` event (`CONFIRMED→SHIPPED`) is now written in the same transaction as the `FULFILMENT` event, exactly matching the code comment added at `apps/api/src/modules/order/order.service.ts:317-333`.

**BUG-API-001 is detailed in §3.**

### 2.3 Inventory — adjustments, low-stock

| # | Check | Result | Evidence |
|---|---|---|---|
| I-01 | `POST /console/inventory/adjust` valid `+50` | **PASS** | `201`, `quantityOnHand:50, quantityAvailable:50` |
| I-02 | `GET /console/inventory/levels?productId=` reflects the adjustment | **PASS** | Matches I-01's response exactly |
| I-03 | Adjust `-1000` (would take stock negative) | **PASS** | `422 BUSINESS_RULE_VIOLATION`, `"Adjustment would take stock below zero"` — correctly rejected, no negative stock created |
| I-04 | Adjust with `quantityDelta:0` | **PASS** | `422`, `"quantityDelta must not be zero"` |
| I-05 | Adjust with wrong field names (`quantityChange`/no `type`) | **PASS** | `422`, names both missing required fields — confirms the contract is `quantityDelta`+`type`, not looser |
| I-06 | `GET /console/inventory/low-stock` | **PASS** | `200`, returns rows with the standard pagination envelope |

No bugs found in inventory.

### 2.4 Coupons — percentage/fixed-amount bounds (server-side), apply/remove

Directly re-verifies BUG-FE-010's fix (0–100% bound) and the FIXED_AMOUNT integer bound, at the API layer — not just the console form.

| # | Check | Result | Evidence |
|---|---|---|---|
| C-01 | `PERCENTAGE`, `discountValue:"150"` | **PASS** | `422`, `"Percentage must be between 0 and 100"` |
| C-02 | `PERCENTAGE`, `discountValue:"0"` | **PASS** | `422`, same message (0 correctly rejected, not just >100) |
| C-03 | `PERCENTAGE`, `discountValue:"100"` (boundary) | **PASS** | `201` — upper boundary accepted |
| C-04 | `FIXED_AMOUNT`, `discountValue:"19.99"` (non-integer) | **PASS** | `422`, `"Must be a non-negative integer amount in minor units"` |
| C-05 | `FIXED_AMOUNT`, `discountValue:"5000"` (valid minor units) | **PASS** | `201` |
| C-06 | Apply a valid 100%-off coupon to a cart | **PASS** | `discount` = full subtotal, `total: 0.00` — clamped correctly, never negative |
| C-07 | Apply a nonexistent coupon code | **PASS** | `422 COUPON_NOT_ELIGIBLE`, `"Coupon '...' is not valid"` — not a 500, not a false-positive apply |
| C-08 | Remove coupon from cart | **PASS** | `200`, `couponCode:null`, `total` reverts to pre-discount subtotal |
| C-09 | `DELETE /console/coupons/:id` (regression check for KF-03's `CouponEntity`) | **PASS** | `204` |

No bugs found in coupons — the server-side bound fix holds independently of the console form.

### 2.5 Cart & Checkout — COD fee preview/placement parity (BUG-FE-011 re-verification)

| # | Check | Result | Evidence |
|---|---|---|---|
| CO-01 | `POST /storefront/cart?storeId=` create | **PASS** | `201`, empty cart |
| CO-02 | `POST /storefront/cart/:id/items` add item | **PASS** | `200`, line added with correct unit/line pricing |
| CO-03 | `POST /storefront/checkout/pricing` **without** `paymentGateway` | **PASS** | `total: 2849.00` (subtotal 2799 + shipping 50, **no** COD fee, no `codFee` key in response) |
| CO-04 | `POST /storefront/checkout/pricing` **with** `paymentGateway:"cod"` | **PASS** | `codFee: 30.00` present, `total: 2879.00` (2849 + 30) |
| CO-05 | Place the same cart as a real COD order | **PASS** | `201`, `total: 2879.00` — **matches the CO-04 preview exactly**, closing the gap BUG-FE-011 documented |
| CO-06 | Order detail after placement carries the same `codFee` | **PASS** | Order response includes `"codFee":{"amountMinor":"3000",...}` alongside `total: 2879.00` |

**Evidence (side-by-side):**

```
POST /storefront/checkout/pricing  (no paymentGateway)
-> total: 2849.00   (no codFee key)

POST /storefront/checkout/pricing  (paymentGateway: "cod")
-> codFee: 30.00, total: 2879.00

POST /storefront/checkout/orders   (paymentGateway: "cod", same cart contents)
-> total: 2879.00   (matches the cod-aware preview, not the no-gateway preview)
```

This confirms KF-08/BUG-FE-011 is fixed at the API level: the preview and the placed order agree exactly once `paymentGateway` is passed, and the fee is transparently omitted (not silently zeroed) when it isn't.

### 2.6 Customers — phone-only creation (BUG-FE-005 re-verification), CRUD surface

| # | Check | Result | Evidence |
|---|---|---|---|
| CU-01 | Create phone-only (no email) | **PASS** | `201`, `{"email":null,"phone":"+919876568996",...}` — confirms the API itself never had BUG-FE-005's bug; it was purely a console form defect (already fixed there too, per `BUG_REPORT.md`) |
| CU-02 | Create with neither email nor phone | **PASS** | `422`, `{field:"email", message:"Either email or phone is required"}` |
| CU-03 | Create with malformed phone (`"12345"`) | **PASS** | `422`, `"Must be E.164 format, e.g. +919876543210"` |
| CU-04 | Create with malformed email (`"not-an-email"`) | **PASS** | `422`, `"Must be a valid email address"` |
| CU-05 | `PUT /console/customers/:id` update | **PASS** | `200`, `firstName` changed, `updatedAt` bumped |
| CU-06 | `DELETE /console/customers/:id` | **NOT IMPLEMENTED** | `404`, `"Cannot DELETE /api/v1/console/customers/:id"` — this is Nest's own routing 404 for an unmatched route, not an application error. Confirmed by reading `customer.controller.ts`: there is `@Get()`, `@Get(':id')`, `@Post()`, `@Put(':id')`, `@Put`/`@Delete(':id/addresses/:addressId')`, `@Delete(':id/wishlist/:productId')` — but no `@Delete(':id')` on the customer itself. Customer CRUD is really CRU + address/wishlist sub-resource delete, not full CRUD. Not a bug (nothing advertises a delete-customer capability anywhere in the console UI either), but worth recording since the phase brief asked for "Customer CRUD" by name. |

### 2.7 Reviews — submission, rating bounds, moderation, reply

| # | Check | Result | Evidence |
|---|---|---|---|
| R-01 | `POST /storefront/reviews` valid submission | **PASS** | `201`, `status:"PENDING"` (correctly held for moderation, not auto-published) |
| R-02 | `rating:0` | **PASS** | `422`, `"Number must be greater than or equal to 1"` |
| R-03 | `rating:6` | **PASS** | `422`, `"Number must be less than or equal to 5"` |
| R-04 | `POST /console/reviews/:id/moderate` `{"status":"APPROVED"}` | **PASS** | `201`, `status:"APPROVED"` |
| R-05 | Moderate with an invalid enum value | **PASS** | `422`, names the valid options (`APPROVED`\|`REJECTED`\|`SPAM`) |
| R-06 | `POST /console/reviews/:id/reply` | **PASS** | `201`, `merchantReply` + `merchantRepliedAt` set |

No bugs found in reviews.

### 2.8 Support tickets — SEC-001 fix confirmation (quick check, not a full re-run)

| # | Check | Result | Evidence |
|---|---|---|---|
| S-01 | Create a northwind support ticket as `owner@northwind.test` | **PASS** | `201`, `01M20EF7TGP86A65P748BBPZ8A` / `TKT-MTSMG7DA` |
| S-02 | `owner@lakeside.test` (a different tenant) reads that ticket directly by id | **PASS** | `404 RESOURCE_NOT_FOUND` — the exact SEC-001 read exploit, now correctly blocked |
| S-03 | `owner@lakeside.test` posts a message onto that ticket | **PASS** | `404 RESOURCE_NOT_FOUND` — the exact SEC-001 write exploit, now correctly blocked |

SEC-001 fix holds under a fresh, independent probe. Full detail already in `SECURITY_REPORT.md`; not re-run in depth here per the phase brief.

**Side observation (not a new bug, extends the already-open KF-07):** the ticket create response shows `"tenantId":"1","requesterUserId":"1"` — the same internal-id-leak pattern KF-07 already documents for products/order-items, now also seen on support tickets. Not investigated further as its own bug since KF-07 already covers the class of defect and Phase 5's brief scoped KF-07 confirmation to the two fields explicitly named.

### 2.9 KF-07 confirmation (contract correctness — internal ids vs public ULIDs)

Per the phase brief, confirmed with live `GET` requests whether this P2, previously-open finding is still present.

**`ProductResponse.storeId`:**

```http
GET /api/v1/console/products?page=1&limit=3
```
```json
{"id":"01M1YG34X9HN80WBJA1Z49QVDQ","storeId":"1", ...}
```

`storeId` is `"1"` — a raw internal integer id, not the public ULID (`01M1W1MAYS3746WD70SB4ZZPGA`) that `GET /console/stores` returns for the same store. **Still present.**

**`OrderItemResponse.productId`:**

```http
GET /api/v1/console/orders/01M20A7GB46F3F8BBMQ8C6WC7B
```
```json
{"items":[{"productId":"1","variantId":null,"sku":"WIDGET-001",...}]}
```

`productId` is `"1"`, again a raw internal id, despite `packages/contracts/src/order/order.contracts.ts:57` declaring `productId: publicIdSchema.nullable()` — the contract promises a ULID and the live response does not deliver one.

**Verdict: KF-07 is CONFIRMED STILL OPEN, P2, exactly as recorded in `QA_REPORT.md` §4.** No new diagnosis needed — the existing root-cause description (internal FK id returned instead of a joined/mapped public id) matches what's observed live.

**Retest Status — FIXED, retested live** (post-Phase-5 follow-up). Added `ProductRepository.publicIdsFor('stores'|'brands'|'tax_classes', ...)` and `OrderRepository.publicIdsFor('stores'|'products'|'product_variants', ...)`, batch-reverse lookups matching the pattern already used for `categoryIds`/customer wishlist/review responses elsewhere in this codebase. `ProductService.toResponse()` and `OrderService.toResponse()` now resolve `storeId`/`brandId`/`taxClassId` and `storeId`/`items[].productId`/`items[].variantId` respectively before returning. Re-verified with fresh live requests:

```http
GET /api/v1/console/products?page=1&limit=1
```
```json
{"id":"01M1YG34X9HN80WBJA1Z49QVDQ","storeId":"01M1W1MAYS3746WD70SB4ZZPGA","brandId":null,"taxClassId":null}
```
```http
GET /api/v1/console/orders/01M20GER94XN7XJ02Q6E81TP7P
```
```json
{"storeId":"01M1W1MAYS3746WD70SB4ZZPGA", "items":[{"productId":"01M1W1VMWF4YAM5HZ6AA8AZ16B","variantId":null,...}]}
```

Both now return public ULIDs matching what `GET /console/stores` and `GET /console/products/:id` independently report for the same records. API unit suite re-run clean (138/138) and `tsc --noEmit` clean on `apps/api` and `packages/contracts` after the fix.

**Not fixed — flagged as a new follow-up item, not KF-07 itself:** the "side observation" below (§2.9 continued) that support tickets leak `tenantId`/`requesterUserId` the same way was left untouched — it needs an async lookup against the platform `tenants`/`users` tables from a currently-synchronous `toResponse()` in `support-ticket.controller.ts`, a slightly different shape of fix, and wasn't part of what was explicitly asked to be fixed in this pass.

### 2.10 Validation robustness — cross-cutting checks

Beyond the per-resource validation already shown above (§2.1–2.7), the following general request-shape checks were run against `console/products` as a representative write endpoint (the same `ZodValidationPipe` + envelope is shared by every console controller, confirmed by the identical error shape seen across products/coupons/customers/inventory/reviews above):

| # | Check | Result | Evidence |
|---|---|---|---|
| V-01 | `limit=0` | **PASS** | `422`, `"Number must be greater than 0"` |
| V-02 | `limit=10000` (far beyond the max) | **PASS** | `422`, `"Number must be less than or equal to 100"` — confirms a real server-side cap, not just a UI default |
| V-03 | `page=-1` | **PASS** | `422`, `"Number must be greater than 0"` |
| V-04 | `page=0` | **PASS** | `422`, same message |
| V-05 | `POST` with a completely empty body | **PASS** | `422 VALIDATION_FAILED` (not a 500/crash) |
| V-06 | `POST` with syntactically invalid JSON (`{not valid json`) | **PASS** | `400 MALFORMED_REQUEST`, names the exact JSON parse error and position — handled before the body ever reaches Zod |

No endpoint tested in this phase returned a `500` for bad input — every validation failure surfaced as a `400`/`422`/`404` with the standard `{success:false,error:{code,message,...}}` envelope.

### 2.11 API convention consistency

| # | Check | Result | Evidence |
|---|---|---|---|
| CONV-01 | Pagination shape (`page`,`limit`,`total`,`totalPages`,`hasNext`,`hasPrev`) across products/orders/customers/coupons/reviews/inventory-movements | **PASS** | Identical shape confirmed on all six list endpoints, e.g. `{"page":1,"limit":2,"total":34,"totalPages":17,"hasNext":true,"hasPrev":false}` for orders |
| CONV-02 | Error envelope shape across 404/422/409/400 | **PASS, with one nuance** | Base shape `{success:false,error:{code,message,...}}` is universal. The `...` varies by error type: `422` carries `details:[{field,code,message}]`; `404` carries `context:{resource,identifier}` instead; `409` sometimes carries neither. This is a reasonable, consistent-enough pattern (not the exact `{code,message,details}` triple the phase brief described verbatim, since `details` is specific to validation errors) — not raised as a bug, just documented precisely since the brief asked for consistency to be checked. |
| CONV-03 | 404 for a genuinely nonexistent id vs a malformed (non-ULID) id | **PASS** | Both return `404 RESOURCE_NOT_FOUND` with the identifier echoed back, on products, orders, customers, and coupons alike — no endpoint 500s on a malformed id, and none conflates "malformed" with "403" |
| CONV-04 | Idempotency-Key requirement is enforced consistently on mutating financial endpoints | **PASS** | Both `storefront/checkout/orders` and `console/orders/:id/refund` require it (`@Idempotent()` decorator) and reject its absence with the same `400 MALFORMED_REQUEST` shape |

---

## 3. Bug reports

### BUG-API-001 — `fulfil` never checks the order's own status: a CANCELLED order can be fulfilled and shipped

| Field | Value |
|---|---|
| **Bug ID** | BUG-API-001 |
| **Severity** | **P1** — a cancelled order is a business dead-end everywhere else in the system (cannot be re-cancelled, presumably not expected to ship), but `fulfil` has no guard against it at all. The result is a real, persisted inconsistent state (`status:"CANCELLED"` with `fulfilmentStatus:"FULFILLED"`) and a real shipment record created for an order nobody should be packing — this is not cosmetic, a warehouse integration or a human following the order list could physically ship a cancelled order. Not P0 because it does not corrupt money (no payment was captured/charged) and does not cross a tenant boundary. |
| **Module** | `apps/api/src/modules/order/order.service.ts`, `fulfil()` |
| **Endpoint** | `POST /api/v1/console/orders/:id/fulfil` |
| **Environment** | API `http://localhost:4000/api/v1`, 2026-09-08 |
| **User** | `owner@northwind.test` (STORE_OWNER, full perms — not an RBAC issue) |
| **Tenant** | `northwind` |
| **Precondition** | An order that has been cancelled (`status:"CANCELLED"`) with at least one unfulfilled item. |

**Steps to Reproduce**

1. Place a COD order via `storefront/checkout/orders` (auto-`CONFIRMED`).
2. `POST /console/orders/:id/cancel` → order becomes `status:"CANCELLED"`.
3. `POST /console/orders/:id/fulfil` with a valid `orderItemId` and an open quantity.

**Expected Result**

A cancelled order should not be fulfillable. The endpoint should reject the request (e.g. `409 ORDER_NOT_FULFILLABLE` or similar), the same way `cancel` itself rejects being called twice (`409 ORDER_NOT_CANCELLABLE`).

**Actual Result**

The request succeeds (`201`). A shipment is created, `quantityFulfilled` is incremented, and `fulfilmentStatus` becomes `"FULFILLED"` — while `status` stays `"CANCELLED"` (the only reason `status` doesn't also change to `"SHIPPED"` is an unrelated guard — `if (allFulfilled && (order.status === 'CONFIRMED' || order.status === 'PROCESSING'))` — that happens to also block this specific downstream symptom, not because cancellation was checked).

**Evidence**

```http
POST /api/v1/console/orders/01M20E8RZD0EHK0TXMBGXR15G3/cancel HTTP/1.1
Authorization: Bearer <owner@northwind.test>
Content-Type: application/json

{"reason":"QA-API cancel test"}
```
```json
201 { "status": "CANCELLED", "cancelReason": "QA-API cancel test", ... }
```

```http
POST /api/v1/console/orders/01M20E8RZD0EHK0TXMBGXR15G3/fulfil HTTP/1.1
Authorization: Bearer <owner@northwind.test>
Content-Type: application/json

{"items":[{"orderItemId":"35","quantity":1}]}
```
```json
201 {
  "id": "01M20E8RZD0EHK0TXMBGXR15G3",
  "orderNumber": "ORD-000034",
  "status": "CANCELLED",
  "fulfilmentStatus": "FULFILLED",
  "cancelReason": "QA-API cancel test",
  "items": [{ "id":"35", "quantityFulfilled": 1, "quantityCancelled": 0, ... }],
  ...
}
```

A follow-up double-cancel on the same order confirms the state machine *does* protect `cancel` itself, which sharpens the contrast — `fulfil` is the one path with no status guard:

```http
POST /api/v1/console/orders/01M20E8RZD0EHK0TXMBGXR15G3/cancel   (2nd time)
```
```json
409 { "error": { "code": "ORDER_NOT_CANCELLABLE", "message": "Order cannot be cancelled from status 'CANCELLED'" } }
```

**Root Cause**

`apps/api/src/modules/order/order.service.ts:221-230` — `fulfil()`'s only precondition check is:

```ts
const order = await orders.findByPublicIdOrFail(publicId);
if (order.fulfilmentStatus === 'FULFILLED') {
  throw new OrderAlreadyFulfilledError('This order has already been fully fulfilled');
}
```

There is no check of `order.status` at all — contrast with `hold()` (`order.status !== 'CONFIRMED' && order.status !== 'PROCESSING'` → reject), `cancel()` (rejects unless in an early-enough status), and `resume()` (`order.status !== 'ON_HOLD'` → reject), all of which validate the order's own status before acting. `fulfil()` is the outlier: it happily creates a shipment (`shipmentsRepo.insert(...)`), mutates `quantityFulfilled` on the order items, and writes a `FULFILMENT` timeline event, regardless of whether the order is `CANCELLED`, `ON_HOLD`, or `COMPLETED`. (`ON_HOLD` and `COMPLETED` were not independently tested live in this pass — only `CANCELLED` was reproduced — but the same missing guard applies to them by inspection of this same code path, since none of `order.status` is ever read before the shipment is created.)

**Suggested Fix**

Add an explicit status guard at the top of `fulfil()`, e.g. reject unless `order.status` is one of `CONFIRMED`/`PROCESSING`/`PARTIALLY_FULFILLED`-equivalent in-flight statuses — mirroring the pattern already used by `hold()`/`cancel()`/`resume()` in the same file — and throw a dedicated error (e.g. `OrderNotFulfillableError`) analogous to the existing `OrderNotCancellableError`/`OrderAlreadyFulfilledError`.

**Retest Status** — **FIXED, retested live.** `fulfil()` now checks `order.isFulfillable` (`status === 'CONFIRMED' || 'PROCESSING'`, mirroring `hold()`'s own precondition) before doing anything, throwing the new `OrderNotFulfillableError` (`409 ORDER_NOT_FULFILLABLE`) otherwise. Reproduced the exact original exploit on a fresh order (`ORD-000035`): placed → cancelled → `fulfil` attempted →

```json
409 { "success": false, "error": { "code": "ORDER_NOT_FULFILLABLE",
      "message": "Order cannot be fulfilled from status 'CANCELLED'",
      "context": { "currentStatus": "CANCELLED" } } }
```

Regression-checked immediately after on a separate, legitimately `CONFIRMED` order (`ORD-000036`): `fulfil` still succeeds normally (`201`, `status: "SHIPPED"`, `fulfilmentStatus: "FULFILLED"`). `ON_HOLD`/`COMPLETED` are covered by the same guard by construction (`isFulfillable` only admits `CONFIRMED`/`PROCESSING`) though not independently re-exercised live. API unit suite re-run clean (138/138) after the fix.

---

## 4. Coverage note

This phase intentionally did not attempt literal, alphabetical coverage of all 264 routes. It prioritized, per the phase brief: (1) core commerce workflow correctness — product/order/inventory/coupon/cart/checkout/customer/review/support-ticket — exercised end-to-end with real data through real HTTP calls; (2) input validation robustness on every major write endpoint touched; (3) cross-cutting API convention consistency (pagination, error envelope, 404 handling); (4) a live confirmation of the one open contract-correctness item named in the brief (KF-07). Areas explicitly out of scope for this phase (tenant isolation, RBAC matrix, frontend, concurrency, load, Docker/SMTP/MinIO/queue-dependent flows) were not re-tested — see `QA_REPORT.md` §5 and `SECURITY_REPORT.md` for that coverage. Modules not touched at all in this pass (out of the full 53-controller surface) include CMS/blog, themes, marketplace, channels, banners, menus, SEO, loyalty, gift cards, campaigns, webhooks, and settlement/reconciliation — these are lower-priority per the phase's own business-criticality ordering and were not claimed as tested.

Test data created this phase (prefixed `QA-API-`) was left in place per the phase's own convention (matching `QA-FE-`/`QA-RBAC-`/`QA-Northwind`/`QA-Lakeside` residue from earlier phases already present in the database) — nothing was deleted except where a delete/cancel call was itself the thing being tested.
