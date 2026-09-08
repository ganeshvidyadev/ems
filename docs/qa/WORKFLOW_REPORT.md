# EMS — Business Workflow Report (QA Phase 7)

**Phase:** 7 — Business workflows (multi-step, multi-module, end-to-end)
**Executed:** 2026-09-08, live against the running dev stack
**Environment:** API `http://localhost:4000/api/v1` · Console `http://localhost:3000` · Storefront `http://northwind.ems.localhost:3001` · MySQL `127.0.0.1:3307`
**Method:** Real HTTP requests (curl, captured JWTs) plus live browser verification (Claude Browser tool) for UI-visible steps. No individual endpoint/UI-element re-testing — that's Phases 3/4/5. This phase chains real steps across modules the way a merchant/shopper actually would.
**Out of scope (see brief):** tenant isolation/RBAC (Phase 6, done), endpoint validation edge cases (Phase 5, done), individual UI element testing (Phases 3/4, done), concurrency (Phase 8), performance (Phase 9), anything needing Docker/SMTP/MinIO/queue-Redis (`QA_REPORT.md` §5 — BLOCKED).
**Test data prefix:** `QA-WF-`

Per the QA charter, every result uses exactly one of `PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`, `NOT TESTED`, `SKIPPED`. Nothing is silently converted to PASS.

---

## 0. Summary

**Note on execution:** the agent running this phase stalled (no progress for 600s) immediately after completing Workflow 5 and before it could write this summary or update `QA_REPORT.md` — an infrastructure hiccup, not an abandoned test. All 5 planned workflows below were in fact carried through to a verdict with live evidence; this summary was filled in afterward by reading the completed sections, not by re-running anything.

| Severity | Count | IDs |
|---|---|---|
| **P1** | **1** | WF-004 |
| **P2** | **2** | WF-002, WF-003 |
| **P3** | **1** | WF-001 |
| **Total new findings** | **4** | |

**Headline result:** every state-machine invariant this phase specifically set out to verify — inventory commit/restock/release on order commit/cancel, coupon usage-limit and expiry gating, review-moderation-to-storefront-rating, and the fulfil→ship→close timeline — held correctly under live, contrasting before/after evidence. The one P1, **WF-004**, is a genuine, newly-discovered architectural gap: the payment-gateway webhook settlement path can never succeed for *any* non-COD gateway (Razorpay/Stripe/Cashfree/PhonePe/stub alike) because its tenant-scoped repository lookup requires a tenant context that a public, unauthenticated webhook request structurally cannot carry — meaning every paid (non-COD) order in this system is designed to stay stuck at `PENDING` forever today, regardless of environment. This was not previously known — Phase 5's API pass exercised COD end-to-end but never drove a non-COD order through its real settlement webhook. The two P2s (WF-002: storefront search silently drops any query under 4 characters; WF-003: the order-shipments endpoint always returns empty due to a public/internal id mismatch) and one P3 (WF-001: a dead, UI-less inventory field) are narrower, self-contained defects. One workflow (refund) was left `BLOCKED` as a direct, disclosed consequence of WF-004 rather than an environment limitation, and one sub-case (resume-to-`PROCESSING`) is `NOT TESTED` because the codebase has no path that ever produces a `PROCESSING` order today.

Per-workflow verdicts (full detail and evidence in §2-§6 below):

1. **Merchant onboards a product end-to-end** — correct end-to-end at the data/API layer; blocked from full UI confirmation by the already-known BUG-FE-003; surfaced WF-001 and WF-002.
2. **Shopper buys, merchant fulfils, end-to-end** — correct end-to-end everywhere reachable (pricing, coupon math, inventory timing, fulfil→ship→close timeline); re-confirmed BUG-FE-011 and BUG-FE-018 hold; surfaced WF-003.
3. **Something goes wrong and gets corrected (cancel/hold-resume/refund)** — cancel's restock-vs-release split is a clean PASS with contrasting evidence; hold/resume correct for the only reachable prior status; refund BLOCKED by the newly-found WF-004.
4. **Customer relationship (guest→customer link, review moderation)** — review→moderate→storefront→rating chain fully correct; guest-to-customer linkage confirmed as a genuine, precisely-scoped product gap (by design), not a bug.
5. **Coupon lifecycle (usage limit, expiry)** — both gates enforced correctly with contrasting before/after evidence, including the more realistic mid-lifecycle-expiry case.

---

## 1. Test accounts and fixtures

| Account | Role | Tenant |
|---|---|---|
| `owner@northwind.test` | STORE_OWNER | northwind (`01M1VYDRBXZ959TXST7ZT1FTB4`) |
| `ops@northwind.test` | ORDER_MANAGER | northwind |

Store: `01M1W1MAYS3746WD70SB4ZZPGA` (Northwind Main Store). Warehouse: `01M1W8RWAXQ1F15TRS6JQ3N3PY` (Main Warehouse, code `MAIN`).

Both logins reconfirmed live at phase start:
```
POST /api/v1/auth/login {"email":"owner@northwind.test",...} -> 200 AUTHENTICATED
POST /api/v1/auth/login {"email":"ops@northwind.test",...} -> 200 AUTHENTICATED
```
Access tokens expire in 600s; re-login was performed periodically through the phase as needed (noted inline only where relevant to a timing-sensitive check).

---

## 2. Workflow 1 — Merchant onboards a new product end-to-end

**Scenario:** create a product in the console → set inventory in a warehouse → publish it → confirm it's visible/purchasable on the storefront with correct price/stock → confirm low-stock surfaces once stock drops below threshold.

| # | Step | Result | Evidence |
|---|---|---|---|
| W1-01 | Console UI: log in as `owner@northwind.test`, navigate to `/products/new`, fill Name=`QA-WF-Product-1`, SKU=`QA-WF-SKU-001`, Price=`499.00`, Status=DRAFT, submit | **PASS** | `POST /console/products` → `201`, `{"id":"01M20GV0YS5MZSZPN0G5QGKW3Y","status":"DRAFT","priceMinor":"49900",...}` (captured live via browser network trace) |
| W1-02 | Console UI: `/inventory/01M20GV0YS5MZSZPN0G5QGKW3Y` → "Adjust stock" → warehouse=Main Warehouse, quantity change `+30` | **PASS** | UI table updated to `On hand 30 / Available 30`; movement history row `ADJUSTMENT +30 → 30`, reason "QA-WF initial stock" |
| W1-03 | Console UI: same page → "Edit" on the warehouse row → set Reorder point = `20` → Save | **PASS** | Row now reads `Reorder point: 20`. **Note:** this is `inventory_levels.reorder_point`, a per-warehouse field — see finding below re: the product-level `lowStockThreshold` field |
| W1-04 | Console UI: `/products/01M20GV0YS5MZSZPN0G5QGKW3Y` → Status dropdown DRAFT→ACTIVE → "Save changes" | **PASS** | `PUT /console/products/:id` → `200`, `{"status":"ACTIVE","publishedAt":"2026-09-08T12:48:23.922Z"}` |
| W1-05 | Storefront: `GET /storefront/products/qa-wf-product-1` (API) and browser navigation to `http://northwind.ems.localhost:3001/products/qa-wf-product-1` | **PASS (API) / BLOCKED (UI)** | API: `200`, correct `name/priceMinor:"49900"/status:"ACTIVE"`. UI: page never leaves the "Loading products" skeleton — this is the pre-existing, already-documented **BUG-FE-003** (storefront Suspense boundary never resolves under `/products/*`), not a new defect. Confirmed via `document.body` inspection that the correct rendered markup (₹499.00, name, SKU) exists in React's hidden streaming buffer outside `<main>`, exactly matching BUG-FE-003's known root cause — so the underlying data pipeline for this workflow step is verified correct, only the storefront's own UI presentation of it is blocked |
| W1-06 | Storefront catalogue listing: `GET /storefront/products` (unfiltered) | **PASS** | New product appears in the full listing (`total:18`, includes `QA-WF-Product-1`) |
| W1-07 | Merchant drops stock below the reorder point: `POST /console/inventory/adjust` (same endpoint the "Adjust stock" UI action calls) `quantityDelta:-15` → on-hand 15 | **PASS** | `200`, `{"quantityOnHand":15,"quantityAvailable":15,"reorderPoint":20}` |
| W1-08 | Console UI: `/inventory` low-stock view | **PASS** | `QA-WF-Product-1 / QA-WF-SKU-001 · Main Warehouse · On hand 15 · Available 15 · Reorder point 20` now listed alongside the pre-existing `Test Widget` low-stock row — confirmed live in the rendered page text, not just the API |

**Finding WF-001 (P3, cosmetic/contract-hygiene, not a functional break) — `Product.lowStockThreshold` has no console UI anywhere and is functionally dead:**
The product create (`/products/new`) and edit (`/products/[id]`) forms have no field for it (confirmed by reading the full accessibility tree of both forms — every other `createProductRequestSchema` field with a UI has one, this one does not). The actual "low stock" mechanism used everywhere in the app (`GET /console/inventory/low-stock`, the Inventory page's Low Stock view) is a **different, per-warehouse field**, `inventory_levels.reorder_point`, set via the Inventory page's own "Edit" reorder-settings dialog (exercised successfully in W1-03/W1-08). `Product.lowStockThreshold` remains `null` for every product in this tenant, including ones created long before this session (checked several via `GET /console/products`). Not a functional break — the real low-stock feature works correctly end-to-end (W1-07/W1-08) — but the schema field is either vestigial or a planned-but-unbuilt product-level fallback; worth a decision (remove from the contract, or build the missing UI) rather than leaving a schema field permanently unreachable from the UI.

**Finding WF-002 (P2) — Storefront full-text search (`GET /storefront/products?q=`) silently returns zero results for any query under 4 characters:**

| Query | Result |
|---|---|
| `q=test` (4 chars) | `total:1`, matches "Test Widget" |
| `q=tes` (3 chars) | `total:0` |
| `q=chair` | `total:1`, matches "Aeron Mesh Desk Chair" |
| `q=cha` (3 chars) | `total:0` |
| `q=QA-WF-Product-1` (exact name) | `total:1` |
| `q=qa` / `q=QA` / `q=wf` (2 chars) | `total:0` each |

Root cause confirmed by reading `apps/api/src/modules/product/services/mysql-fulltext.adapter.ts:31-44`: the storefront search runs `MATCH(name, short_description, meta_keywords) AGAINST (? IN NATURAL LANGUAGE MODE)`, a MySQL `FULLTEXT` query, which silently ignores any search term shorter than the server's configured minimum token length (this DB instance's effective minimum is 4 characters — 3-char terms consistently return zero, 4-char terms consistently work). No error, no "no results for short query" messaging — a shopper searching a genuinely short product term (a 2–3 letter brand/model name, "TV", "pen", "bag", "USB", "SSD") gets an empty result set indistinguishable from "we don't sell that." The **console's own** "Find a product" search (`product.repository.ts:104`, plain `LIKE '%q%'`) does not have this limitation — the same word that fails on the storefront works fine in the console, so this is a storefront-only, customer-facing regression risk. Filed as **P2**: not a crash or data-loss, but a real, silent, unbounded-impact defect in core product discovery — the single most basic step of Workflow 2 below.

**Workflow 1 verdict:** the merchant-onboarding chain holds together correctly end-to-end at the data/API layer (create → stock → publish → storefront-visible → low-stock alert), with one already-known UI blocker (BUG-FE-003) preventing a shopper from actually *seeing* the rendered product page, and two new findings (WF-001 minor contract hygiene, WF-002 a real search defect) surfaced specifically because this phase chased the workflow all the way to the storefront rather than stopping at the API.

**Testing note (not a scored finding):** console mutation buttons (`Create product`, `Save changes`, `Create coupon`, `Fulfil remaining items`, `Close order`) frequently required 2-4 identical clicks in this browser-automation session before the underlying `POST`/`PUT` actually fired — confirmed via network-request traces showing zero requests for the first 1-3 clicks, then exactly one clean request on the click that worked (never a duplicate submission, so no data-integrity impact observed). Plain navigation, `read_page`, and `form_input` never exhibited this. This could be a genuine console hydration-timing issue (the page looking interactive before its click handlers attach — the same *class* of defect, though a different app, as BUG-FE-003) or an artifact of this specific browser-automation tool; not enough evidence to file as a scored bug, but worth a dedicated, tool-independent repro session before being dismissed.

---

## 3. Workflow 2 — Shopper discovers, buys; merchant fulfils, end-to-end

**Scenario:** browse/search storefront → view product → add to cart → apply coupon → COD checkout → confirm order in console (totals/coupon/items) → merchant fulfils (ships) → merchant closes (completes) → confirm timeline and inventory decrements are correct at each step.

| # | Step | Result | Evidence |
|---|---|---|---|
| W2-01 | Merchant creates a coupon via console UI `/coupons/new`: code `QA-WF-SAVE10`, 10% off, usage limit 5 | **PASS** | `POST /console/coupons` → `201`, `{"id":"01M20HCDPX6Q2R7H9CWPBGXDXV","code":"QA-WF-SAVE10","discountType":"PERCENTAGE","discountValue":"10","usageLimitTotal":5,"status":"ACTIVE"}` |
| W2-02 | Shopper browses/searches the catalogue | **BLOCKED (UI) / PASS (API)** | Storefront `/products` UI is blocked by the same pre-existing **BUG-FE-003** as W1-05 (Suspense never resolves). At the API level, `GET /storefront/products` correctly lists all 18 active products including `QA-WF-Product-1`. **New finding WF-002 (logged under Workflow 1, applies here too)**: the storefront's own search (`?q=`) silently fails for any query under 4 characters — directly relevant here since "discover via search" is this workflow's first step |
| W2-03 | Shopper views product detail | **BLOCKED (UI) / PASS (API)**, same as W1-05 | `GET /storefront/products/qa-wf-product-1` → correct price/stock data; storefront page itself stuck on skeleton (BUG-FE-003) |
| W2-04 | Shopper creates a cart and adds 2× `QA-WF-Product-1` | **PASS** | `POST /storefront/cart?storeId=...` → `201` empty cart `01M20HD0ZEEVP0936QX4FPGGZA`; `POST /storefront/cart/:id/items?storeId=...` (note: `storeId` must be repeated as a query param on this call too, not just cart creation — easy to miss, not itself a bug since it's consistent, just undocumented in the contract file) → `200`, `subtotal: 998.00` |
| W2-05 | Shopper applies coupon `QA-WF-SAVE10` | **PASS** | `POST /storefront/cart/:id/coupon {"code":"QA-WF-SAVE10"}` → `200`, `discount: 99.80` (exactly 10% of 998.00), `total: 898.20` |
| W2-06 | Inventory check — cart operations must never reserve/decrement stock | **PASS** | `GET /console/inventory/levels` unchanged (`onHand:15, reserved:0`) after both W2-04 and W2-05 — cart add and coupon-apply correctly have zero inventory side effects |
| W2-07 | Checkout pricing preview, COD | **PASS** | `POST /storefront/checkout/pricing` (paymentGateway:"cod") → `subtotal 998.00, discount 99.80, shipping 50.00, codFee 30.00, total 978.20` |
| W2-08 | Place the order (COD), with `Idempotency-Key` | **PASS** | `POST /storefront/checkout/orders` → `201`, `orderNumber: ORD-000037`, `total: 978.20` — **exact match** to the W2-07 preview |
| W2-09 | Inventory after order placement | **PASS** | `quantityOnHand` dropped `15 → 13` (the 2 units sold), `quantityReserved` back to `0`. Movement log shows the mechanism precisely: a `RESERVATION +2` event immediately followed (40ms later) by a `SALE -2` event, both `referenceType:"ORDER"` tagged to this order — confirming the code comment in `order.service.ts`'s `cancel()` doc: for COD, reserve-then-commit happen back-to-back in the same transaction, not as two workflow stages a merchant waits between |
| W2-10 | Order visible correctly in console UI | **PASS** | `/orders/01M20HFJP8Z34AQEZWD2ZGSBM9` renders `CONFIRMED / PENDING / UNFULFILLED`, item `QA-WF-Product-1 · qty 2 · ₹898.20`, `Subtotal 998.00 / Discount -99.80 / Shipping 50.00 / COD fee 30.00 / Total 978.20`, address, and a 2-entry timeline (`—→PENDING`, `PENDING→CONFIRMED`) — every figure matches the API response exactly |
| W2-11 | Merchant fulfils (ships) via console UI "Fulfil remaining items" | **PASS** | `POST /console/orders/:id/fulfil` → `201`, order now `status:"SHIPPED"`, `fulfilmentStatus:"FULFILLED"`, `quantityFulfilled:2/2` |
| W2-12 | Merchant closes the order via console UI "Close order" | **PASS** | `POST /console/orders/:id/close` → `200`, `status:"COMPLETED"` |
| W2-13 | Full timeline coherence check | **PASS** | `— → PENDING → CONFIRMED` (checkout) then `FULFILMENT: UNFULFILLED→FULFILLED` + `ORDER: CONFIRMED→SHIPPED` (same fulfil call, same second) then `ORDER: SHIPPED→COMPLETED` (close) — a fully readable, gap-free story, re-confirming BUG-FE-018's fix (already verified in `API_REPORT.md` §2.2) holds under a brand-new order created by this phase |
| W2-14 | Inventory unchanged by fulfil/close | **PASS** | `quantityOnHand` still `13` after both; the movements log has exactly 4 rows total for this product and none of them are tagged to the fulfil or close calls — confirms **fulfil/ship/close never touch inventory in this codebase**; the actual stock commit happens entirely at order-placement time (see W2-09). This is a real, load-bearing clarification of the brief's phrasing ("reservation on cart/checkout, commit on order confirm, decrement on fulfil"): the implemented model is *reserve-then-commit both at checkout* for COD, with **no further inventory event at fulfilment** — not a bug, but the actual invariant differs from a naive 3-stage assumption and should be tested against, not assumed |

**Finding WF-003 (P2) — `GET /console/orders/:orderId/shipments` always returns an empty list; it is called with the order's public ULID everywhere else in the API but filters on the shipment's internal numeric `order_id` column:**

```http
GET /api/v1/console/orders/01M20HFJP8Z34AQEZWD2ZGSBM9/shipments   (the order's real public id)
-> 200 {"success":true,"data":[]}                                  # WRONG — a shipment exists

GET /api/v1/console/orders/40/shipments   (the order's raw internal numeric id, "40")
-> 200 {"success":true,"data":[{"id":"01M20HGYFDSPMCXXSDJ6281A8S","orderId":"40","shipmentNumber":"SHP-MTSOCTT8","carrier":"SELF","status":"PENDING","isCod":true,"codAmount":{"formatted":"978.20"},...}]}
```
Root cause confirmed by reading `apps/api/src/modules/order/shipment.controller.ts:20-25` (`listForOrder` passes `@Param('orderId')` straight into `ShipmentRepository.findByOrder`) and `shipment.repository.ts:17-19` (`find({ where: { orderId } })` against `shipments.order_id`, a `bigint` FK per `shipment.entity.ts:48-49`) — every other console order sub-route (`fulfil`, `hold`, `resume`, `cancel`, `close`, the order detail itself) resolves the public ULID to the internal id first; this one route does not. The shipment record itself is created correctly by `fulfil()` (confirmed above, W2-11/W2-12) — only this specific read path is broken. **Currently zero user-facing impact**: grepped the entire console frontend (`apps/console/src`) for any reference to `/shipments` and found none — no console page calls this endpoint today (matches `QA_REPORT.md` §2.1's note that "Shipping" has no console UI yet). Filed as P2 (a fully broken query, 100% of calls return wrong data) rather than P3, since it will silently look "correct" (empty state, no error) to whatever integration or future UI calls it next. Also re-observed the already-tracked KF-07-class defect on this same endpoint: the shipment response's own `orderId:"40"` field leaks the internal id rather than the order's public ULID.

**Workflow 2 verdict:** the full shopper-buys/merchant-fulfils chain is correct end-to-end where it's reachable — pricing, coupon math, order totals, inventory commit timing, and the fulfil→ship→close timeline all check out exactly, including a live re-confirmation of two previously-fixed bugs (BUG-FE-011's COD-fee parity, BUG-FE-018's timeline gap) holding on a fresh order. Two blockers/gaps surfaced beyond what Phase 5 already found: the storefront UI itself is unusable for browsing/buying interactively (BUG-FE-003, known), and a newly-found, fully-broken shipment-lookup endpoint (WF-003) that happens to have no current UI caller.

---

## 4. Workflow 3 — A workflow that goes wrong and gets corrected (cancel, hold/resume, refund)

**Scenario:** an order gets placed then cancelled (verify `wasCommitted` restock-vs-release split in `order.service.ts`'s `cancel()`); a separate order gets held then resumed (verify it resumes to the correct prior status); a refund is attempted where applicable.

### 4.1 Cancel — committed order (COD, already `CONFIRMED`) → must **restock**

| # | Step | Result | Evidence |
|---|---|---|---|
| W3-01 | Place a fresh COD order (`ORD-000038`, 1× `QA-WF-Product-1`) — auto-`CONFIRMED`, stock committed | **PASS** | On-hand dropped `13 → 12` at placement (same reserve+commit pattern as W2-09) |
| W3-02 | `POST /console/orders/:id/cancel` `{"reason":"QA-WF cancel-after-commit test"}` | **PASS** | `200`, `status:"CANCELLED"`, `cancelReason` recorded, item `quantityCancelled:1` |
| W3-03 | Inventory after cancel | **PASS** | `quantityOnHand` **restored** `12 → 13`. Movement log shows the exact mechanism: `SALE -1` (at placement) followed later by `ADJUSTMENT +1, referenceType:"ORDER_CANCEL"` (at cancel) — precisely the `wasCommitted === true` branch of `order.service.ts:109-118` (`inventory.restock(...)`) |

### 4.2 Cancel — uncommitted order (non-COD gateway, still `PENDING`) → must only **release the reservation**, never restock

Since COD always auto-confirms and commits immediately (no `PENDING`-with-open-reservation window), this branch needed a non-COD gateway to reach. Only `stub` has working credentials in this environment (`QA_REPORT.md` §5), so it was used purely to reach the right *order status*, not to test the gateway itself.

| # | Step | Result | Evidence |
|---|---|---|---|
| W3-04 | Place an order with `paymentGateway:"stub"` (`ORD-000039`) | **PASS** | `201`, order stays `status:"PENDING"` (confirmed live) — unlike COD, a gateway order is not committed until its payment settles |
| W3-05 | Inventory right after placement | **PASS** | `quantityOnHand` **unchanged** at `13`, `quantityReserved` incremented to `1` — a reservation was taken but nothing was sold yet, exactly the pre-commit state |
| W3-06 | `POST /console/orders/:id/cancel` on the still-`PENDING` order | **PASS** | `200`, `status:"CANCELLED"` |
| W3-07 | Inventory after cancel | **PASS** | `quantityOnHand` **still 13** (never touched), `quantityReserved` back to `0`. Movement log shows a single `RELEASE -1` row, `referenceType:"ORDER"` — precisely the `wasCommitted === false` branch (`order.service.ts:119-127`, `inventory.releaseByProduct(...)`), correctly distinct from the restock path exercised in 4.1 |

**Both branches of the `wasCommitted` logic are confirmed correct with live, contrasting evidence** — a genuine end-to-end validation of the exact invariant the brief asked for, not just a code read.

### 4.3 Hold → Resume

| # | Step | Result | Evidence |
|---|---|---|---|
| W3-08 | Place a third COD order (`ORD-000040`, auto-`CONFIRMED`) | **PASS** | — |
| W3-09 | `POST /console/orders/:id/hold` `{"reason":"QA-WF hold test"}` | **PASS** | `200`, `status:"ON_HOLD"` |
| W3-10 | `POST /console/orders/:id/resume` | **PASS** | `200`, `status:"CONFIRMED"` — resumed to the order's actual prior status |
| W3-11 | Timeline coherence | **PASS** | `—→PENDING→CONFIRMED→ON_HOLD→CONFIRMED`, each transition correctly `reason`-tagged and actor-tagged (`hold` reason preserved as `"QA-WF hold test"` on the `CONFIRMED→ON_HOLD` row) |

**Caveat, stated plainly rather than glossed over:** the brief asks to confirm resume "resumes to the correct prior status, not just blindly to CONFIRMED." Reading `order.service.ts:205` shows the code is written correctly for this (`const resumeStatus = holdEntry?.fromStatus ?? 'CONFIRMED'` — it does look up and restore the actual prior status, with `'CONFIRMED'` only as a fallback). **However, this session could not produce a live order whose prior status was anything other than `CONFIRMED`**: `hold()` itself only accepts orders in `CONFIRMED` or `PROCESSING` (`order.service.ts:169`), and a full codebase grep confirms `'PROCESSING'` is checked defensively in three guard conditions but **never actually assigned** as an order's `status` anywhere in this codebase — it is a contract-level enum value with no code path that produces it. So while the *code* to correctly restore a non-`CONFIRMED` prior status exists and looks right, it is currently **dead/unexercised in practice**, since `CONFIRMED` is the only prior status `hold()` can ever see. Recorded as **PASS with a caveat**, not a blind PASS: the only reachable case was verified correct, and the harder case the brief was really asking about (resume-to-PROCESSING) is `NOT TESTED` because the codebase has no way to construct it today, not because of an oversight in this session.

### 4.4 Refund

| # | Step | Result | Evidence |
|---|---|---|---|
| W3-12 | `POST /console/orders/:id/refund` on a COD order (no gateway-captured payment ever exists for COD) | **NOT TESTED (pre-existing, documented)** | Matches `API_REPORT.md` §2.2 row O-10 exactly (`404`, `"Capturable payment for this order not found"`) — not re-run in depth since Phase 5 already covered this exact case; `checkout.service.ts:715-717` confirms by design: `refund()` always requires a `payments` row with `status IN ('CAPTURED','PARTIALLY_REFUNDED')`, and COD never creates one (money is collected at delivery, outside any gateway) |
| W3-13 | Attempt to reach a genuinely refundable state: place a `stub`-gateway order, then settle its payment for real via the *actual* production settlement path (a signed `POST /webhooks/order-payments/stub` webhook — the same path a real Razorpay/Stripe webhook would hit) | **FAIL — new finding WF-004, see below** | The webhook is accepted (`200 {"received":true}`) but the order is left exactly as it was — `status` stays `PENDING`, `paymentStatus` stays `PENDING`, `amountPaid` stays `0.00` — confirmed by a direct DB read of the `payments` row after the call: still `status:"PENDING"`, `gateway_payment_id: null`, i.e. `settleAndConfirm` never actually ran to completion |
| W3-14 | Refund path, consequently | **BLOCKED (by WF-004, not by environment)** | With no way to reach a `CAPTURED` payment for any non-COD order in this environment, the refund endpoint's *success* path (an order that legitimately has money to give back) could not be exercised. This is a real, novel blocker this phase discovered — distinct from the already-documented Docker/SMTP/queue-Redis blockers in `QA_REPORT.md` §5. A manual DB nudge to force a payment row to `CAPTURED` (mirroring the brief's own suggested workaround for the coupon-expiry test in Workflow 5) was considered as a way to test the refund endpoint's own logic in isolation, but a direct write to financial/payment state was correctly declined by this session's own safety controls and was not pursued — appropriately, since fabricating a "money captured" state is a materially different, higher-risk kind of test-data shortcut than adjusting a coupon's `endsAt` date |

**Finding WF-004 (P1) — the order-payment webhook settlement path (`POST /webhooks/order-payments/:gateway`) silently never confirms the order, for any tenant, because its very first database lookup requires a tenant context that a public, unauthenticated webhook route can never have:**

Reproduction:
```
1. Place an order with paymentGateway:"stub"  -> order status PENDING (matches real online-gateway behaviour)
2. Simulate the gateway capturing the payment (POST /api/v1/dev/payments/simulate?orderId=...&succeed=true)
   -> the gateway-side stub payment is genuinely marked "captured" in the adapter's own state
3. Send the actual production webhook the gateway would send:
   POST /api/v1/webhooks/order-payments/stub
   headers: { x-stub-signature: <valid HMAC-SHA256 over the raw body, verified correct> }
   body: {"event":"payment.captured","id":"evt_...","payload":{"payment":{"entity":{"id":"<paymentId>","order_id":"<stubOrderId>"}}}}
   -> 200 {"success":true,"data":{"received":true}}   (webhook signature verified, accepted)
4. GET the order again -> still {"status":"PENDING","paymentStatus":"PENDING","amountPaid":"0.00"}
   GET the payments row directly -> still {"status":"PENDING","gateway_payment_id":null}
```
Root-cause chain, traced through the source (server logs could not be inspected in this session to see the exact swallowed exception, so this is a code-level diagnosis corroborated by the live symptom, not a log-confirmed one):
- `OrderPaymentWebhookController.handle()` (`order-payment-webhook.controller.ts:40-91`) wraps its entire `process()` call in a try/catch that only logs and always returns `200` — correct "always-ack a webhook" discipline in isolation, but it means any exception inside settlement is invisible to the caller and easy to miss without server-log access.
- `process()` → `CheckoutService.settleAndConfirm()` → `this.orderPayments.findByGatewayRef(...)` (`checkout.service.ts:585`).
- `OrderPaymentRepository` (`order-payment.repository.ts:9`) `extends TenantScopedRepository`, whose `findOne()`/`find()` (used by `findByGatewayRef`) unconditionally calls `this.scopeWhere()`, which calls the `tenantId` getter, which calls `RequestContextService.requireTenantId()` (`request-context.service.ts:88-92`) — **this throws `TenantContextMissingError` if no tenant is set on the request context.**
- The order-payment webhook route is `@Public()` (no JWT, no auth guard) and, unlike console routes (JWT `tid` claim) or storefront routes (`Host`/`x-ems-hostname` header), a payment gateway's own webhook call carries **neither** — a gateway has no way to know or send a tenant identifier, and the whole point of looking the payment up by `gatewayOrderId`/`gatewayPaymentId` is to discover which order (and therefore which tenant) it belongs to. Using a `TenantScopedRepository` here is circular: the lookup needs a tenant to run, but the tenant is exactly what the lookup is supposed to reveal.
- This is architectural, not a one-line typo: the same class of repository is correctly used everywhere else in this codebase specifically *because* those call sites already have a tenant in context (an authenticated console user, a resolved storefront host). The webhook path is the one place that structurally cannot.
- Confirmed this is not a stub-only quirk: `OrderPaymentWebhookController` is generic over `:gateway` and resolves the adapter via `PaymentGatewayFactory` the same way for every configured gateway (Razorpay/Stripe/Cashfree/PhonePe/stub) — the broken lookup happens before any gateway-specific code runs, so a **real Razorpay or Stripe webhook confirming a real customer's payment would hit the exact same wall in production**, not just in this dev sandbox.
- The intended safety net — `CheckoutService.reconcilePending()` (`checkout.service.ts:676-704`), whose own doc comment says its job is precisely "a payment stuck in PENDING is resolved by the reconciler without human intervention" — reads its candidate set via `OrderPaymentRepository.findStalePending()`, which **also** extends `TenantScopedRepository` and would hit the identical `requireTenantId()` wall unless something calls it once per tenant with context explicitly set (not evidenced anywhere in the codebase); moreover, this reconciler most likely runs as a scheduled/queued job, which is itself `BLOCKED` in this sandbox — no local queue Redis (`QA_REPORT.md` §5) — so neither the primary path nor its documented fallback can complete an online-gateway order here.

**Impact:** for any payment gateway other than COD, once a shopper actually pays, the order is designed to sit at `PENDING` forever from the platform's own perspective — inventory stays merely reserved (never committed to a real sale), the merchant's console never shows it as `CONFIRMED`, and it can never be fulfilled, refunded, or reported as revenue — while the gateway itself believes the payment succeeded and the money has moved. Rated **P1** (a core task — confirming a paid order — cannot be completed by its designed mechanism, for every tenant) rather than P0 only because COD (this project's one fully-working, verified payment path per `QA_REPORT.md` §5) is unaffected and the checkout/pricing math itself is not implicated.

**Workflow 3 verdict:** the cancel state machine is fully correct and was verified with contrasting live evidence for both the restock and release branches — a clean, unambiguous PASS. Hold/resume is correct for the one prior status the codebase can actually produce (`CONFIRMED`); the harder case the brief asked about is undecidable today because `PROCESSING` is unreachable, not because of a testing gap. The refund path could not be verified end-to-end for a genuine reason discovered by this workflow, not an environment limitation: **WF-004**, a P1 defect that would leave every non-COD order stuck unconfirmed in production.

---

## 5. Workflow 4 — Customer relationship (guest order → registered customer; review → moderation → storefront)

### 5.1 Guest order → later-created registered Customer

**Scenario:** a customer places an order as a guest (email/phone captured ad-hoc, no account), then a merchant creates that same person as a registered `Customer` record in the console — check whether any association forms.

Per `QA_REPORT.md` §5, this project's already-documented gap is "no registered-customer storefront auth" (checkout is guest-only; `customerId` is always client-supplied where it appears at all). This workflow step is about what happens on the **console/merchant side** *after* that fact — does creating a matching `Customer` record retroactively connect to the guest's existing order(s) in any way?

| # | Step | Result | Evidence |
|---|---|---|---|
| W4-01 | Guest order `ORD-000037` placed earlier (Workflow 2) with `email:"qa-wf-shopper@example.com"`, `customerId:null` | **PASS** (baseline) | `GET /console/orders/01M20HFJP8Z34AQEZWD2ZGSBM9` → `"customerId":null,"email":"qa-wf-shopper@example.com"` |
| W4-02 | Merchant creates a `Customer` in the console with the **same email and phone** as the guest order | **PASS** | `POST /console/customers` → `201`, `{"id":"01M20JD0ACMMPBKAX6GKPBQ1EG","email":"qa-wf-shopper@example.com","phone":"+919876543210","totalOrders":0,"isGuest":false}` |
| W4-03 | Re-fetch the original guest order — did it pick up the new `customerId`? | **NOT IMPLEMENTED — no association exists** | `GET` on the same order again → `"customerId":null` still. `GET` on the new customer → `"totalOrders":0` still, even though a real order with the exact same email exists in the same tenant |
| W4-04 | Look for **any** way to manually associate them (a "link to customer" action, an order update endpoint, anything) | **NOT IMPLEMENTED** | `OrderController` (`order.controller.ts`) exposes exactly `GET list`, `GET :id`, `POST :id/cancel\|hold\|resume\|fulfil\|close` — **no `PUT`/`PATCH` on an order at all**, and the console order-detail page's only action buttons are Fulfil/Hold/Cancel/Close (confirmed via the accessibility tree in Workflow 2/3). There is no field, button, or endpoint anywhere in this codebase to retroactively attach a `customerId` to an existing order |

**Verdict on 5.1:** confirmed and documented plainly, as the brief asked, rather than assumed: **there is no order-to-customer association mechanism of any kind once an order is placed as a guest** — not automatic (no email/phone matching job or query), and not manual (no UI action, no API endpoint). This is a direct, logical extension of the already-known "no registered-customer storefront auth" gap (`QA_REPORT.md` §5) rather than a new defect — since the storefront never authenticates a customer, the platform has never needed a "claim my past orders" flow, and none was built. Recorded as **NOT IMPLEMENTED**, not FAIL — nothing here contradicts a documented behaviour, it simply confirms a known gap's downstream consequence with fresh, specific evidence (the `PUT`/`PATCH`-order-endpoint check is new; the underlying gap was already on record).

### 5.2 Review after purchase → moderation → storefront visibility → rating average

| # | Step | Result | Evidence |
|---|---|---|---|
| W4-05 | Attempt a **verified-purchase** review, passing the real `orderItemId` (`38`, from the genuinely-completed `ORD-000037`) with no `customerId` | **FAIL (by design, expected)** | `422 BUSINESS_RULE_VIOLATION`, `"A customer is required to verify a purchase"` — direct, concrete proof that the guest-checkout gap blocks the "verified purchase" badge for every real guest sale in this system, not just a theoretical concern |
| W4-06 | Attempt the same, now passing the just-created `customerId` (`01M20JD0...`) alongside the real `orderItemId` | **PASS (validation correctly rejects the mismatch)** | `422 BUSINESS_RULE_VIOLATION`, `"This order item does not belong to this customer and product"` — confirms the contract's own doc comment (`review.contracts.ts:16-19`, "a mismatch is rejected outright") holds live: the service does not grant a false verified-purchase badge just because a `customerId` was supplied |
| W4-07 | Submit a normal (unverified) guest review — the only kind a guest can actually leave, matching this system's real capabilities | **PASS** | `POST /storefront/reviews` (no `orderItemId`) → `201`, `status:"PENDING"`, `isVerifiedPurchase:false` |
| W4-08 | Rating average before moderation | **PASS** | `GET /console/products/:id` → `ratingAverage:"0.00", ratingCount:0` — a `PENDING` review correctly does not count yet |
| W4-09 | Merchant approves the review | **PASS** | `POST /console/reviews/:id/moderate {"status":"APPROVED"}` → `200`, `status:"APPROVED"` |
| W4-10 | Rating average after moderation | **PASS** | `ratingAverage:"5.00", ratingCount:1` — updates correctly and immediately |
| W4-11 | Visible on the storefront-facing endpoints | **PASS** | `GET /storefront/products/qa-wf-product-1` → `ratingAverage:"5.00"`; `GET /storefront/products/:id/reviews` → the approved review appears, full content intact. (UI rendering of this page is separately blocked by the already-documented BUG-FE-003, consistent with every other storefront page check in this report — the data pipeline itself is correct) |

**Workflow 4 verdict:** the review→moderate→storefront→rating chain is fully correct end-to-end (W4-07 through W4-11), including a live, positive confirmation that the verified-purchase mismatch guard actually works (W4-06), not just that it exists in a doc comment. The customer-relationship half (5.1) surfaced a clean, precisely-scoped, honestly-reported gap rather than a bug: guest orders and registered customers are permanently unconnected records in this system today, by design, given the checkout architecture — worth a product decision, not a fix, and now backed by a concrete "we checked every possible mechanism" finding rather than an assumption.

---

## 6. Workflow 5 — Coupon lifecycle (usage limit and expiry)

**Scenario:** merchant creates a coupon with a usage limit and/or expiry → used successfully within limits → confirm it's rejected once the limit is hit or the end date passes. Per the brief's own allowance, no fast-forward mechanism exists in this system, so the expiry case used a direct API adjustment to the coupon's `endsAt` — stated plainly here, not glossed over.

### 6.1 Usage limit

| # | Step | Result | Evidence |
|---|---|---|---|
| W5-01 | Create `QA-WF-LIMIT2`: 10% off, `usageLimitTotal:2` | **PASS** | `201`, `usageCount:0, usageLimitTotal:2` |
| W5-02 | Use it on order 1 (COD) | **PASS** | Cart apply → `discount:49.90`; order placed `ORD-000042`, `total:529.10` |
| W5-03 | Use it on order 2 (COD) | **PASS** | Same discount applied again; order placed `ORD-000043` |
| W5-04 | Coupon state after 2 uses | **PASS** | `GET /console/coupons/:id` → `usageCount:2, usageLimitTotal:2` — exactly at the limit |
| W5-05 | Attempt a 3rd use | **PASS (correctly rejected)** | `POST /storefront/cart/:id/coupon` → `422 COUPON_USAGE_LIMIT_REACHED`, `"Coupon 'QA-WF-LIMIT2' has reached its usage limit"` — the 3rd order then correctly placed at full price with no coupon, since the apply step failed and nothing overrode that |

### 6.2 Expiry — coupon already expired at creation

| # | Step | Result | Evidence |
|---|---|---|---|
| W5-06 | Create `QA-WF-EXPIRED` with `startsAt`/`endsAt` both in 2020 (a window entirely in the past) | **PASS (accepted — see note)** | `201`, `status:"ACTIVE"` — the API does not reject a creation request whose entire validity window has already elapsed; not filed as a bug (a merchant might legitimately backdate/import historical coupon records), just noted as a real, live-observed behaviour |
| W5-07 | Attempt to apply it | **PASS (correctly rejected)** | `422 COUPON_EXPIRED`, `"Coupon 'QA-WF-EXPIRED' is not currently active"` |

### 6.3 Expiry — coupon expires *mid-lifecycle*, after a successful use (the brief's actual scenario)

This is the more meaningful case: a coupon that was genuinely valid, got used once, and only later passed its end date — as opposed to one that was already dead on arrival (6.2).

| # | Step | Result | Evidence |
|---|---|---|---|
| W5-08 | Create `QA-WF-SOONEXPIRE`: 20% off, `endsAt: 2027-01-01` (valid for a long time from "today", 2026-09-08) | **PASS** | `201`, `status:"ACTIVE"` |
| W5-09 | Use it successfully once | **PASS** | Cart apply → `discount:99.80` (20% of 499.00); order placed `ORD-000045`, `total:479.20` |
| W5-10 | **Directly adjust `endsAt` into the past via the console API** (`PUT /console/coupons/:id {"endsAt":"2026-09-01T00:00:00.000Z"}`) — the explicit, disclosed workaround for the lack of a fast-forward mechanism | **PASS** | `200`, `usageCount:1` (preserved from W5-09), `endsAt` now 7 days before "today" |
| W5-11 | Attempt to use the same coupon again | **PASS (correctly rejected)** | `422 COUPON_EXPIRED`, `"Coupon 'QA-WF-SOONEXPIRE' is not currently active"` — a coupon that was genuinely usable minutes earlier is correctly locked out the moment its window closes, with its prior legitimate redemption (`usageCount:1`) left untouched |

**Workflow 5 verdict:** both gates — usage-limit and expiry — are enforced correctly and were verified with real, contrasting before/after evidence (successful uses immediately followed by a correctly-rejected one), including the more realistic mid-lifecycle-expiry case rather than only a coupon that was already dead at creation. No bugs found in this workflow. The expiry test's `endsAt` adjustment was done via the public console API (not a raw DB edit), disclosed here exactly as the brief required.

---
