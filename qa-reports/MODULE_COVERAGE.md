# EMS QA — Module Coverage

Status vocabulary: **PASS** (exercised, behaved correctly) · **FAIL** (exercised, confirmed defect — see BUG_REPORT) · **BLOCKED** (infrastructure/credential missing) · **NOT_TESTED** (implemented, not exercised in this run) · **NOT_IMPLEMENTED** (verified absent/stub in code).

"Implemented" comes from the verified API inventory (355 routes, 49 module dirs, 76 entities, 19 migrations), not from the README. Test IDs refer to `qa/api` and `qa/e2e`.

| Area / module | Implemented? | Exercised by | Status | Notes |
|---|---|---|---|---|
| Auth: login, /auth/me, logout (token denylist), JWT tamper, alg=none, refresh cookie flags, error enumeration | Yes | AUTH-001..015 | PASS | one wrong attempt per demo account; lockout (5/15 min) read in code, deliberately not triggered |
| Auth: register, verify-email, OTP, MFA, reset-password, change-password | Yes | AUTH-014/015 (validation, enumeration only) | NOT_TESTED | would create tenants/users or need SMTP |
| RBAC (5 roles x /platform, /console groups, write separation) | Yes | RBAC-001..008, CON-008/009 | PASS | least-privilege holds for ORDER_MANAGER / PRODUCT_MANAGER |
| **Tenant isolation** (list/get/put/delete IDOR both directions, header/query/body switching, storefront Host, cart, orders, UI) | Yes | TEN-001..013, SF-013, WF-008, CON-011, STO-008 | PASS (except BUG-005 dev fallback) | No cross-tenant data exposure found. Lakeside has no seeded data, so a QA coupon fixture was created and removed |
| Platform: Website module (9 sections, validation, persistence, public API, marketing, XSS, restore) | Yes | WEB-001..016, MKT-009, CON-006 | PASS | content restored; rows removed so defaults apply again |
| Platform: tenants (create, suspend, reactivate, delete, impersonate, export, features) | Yes | RBAC (403s), CON-005 page render | NOT_TESTED (mutations) | destructive to shared demo tenants |
| Platform: plans (list/CRUD/archive) | Yes | WEB-014/015, MKT-007, CON-007 (read) | PASS (read) / NOT_TESTED (write) | plan data shown on marketing = plans API = MySQL |
| Platform: users, billing/dunning, settlements, alerts, audit log, quota, health, analytics, settings, integrations, logs | Yes | CON-005 (page render, RBAC) | NOT_TESTED (functional) | pages render without JS errors/5xx; BUG-012 noise |
| Platform: queues, tenant export, theme-access/workspace | Yes | CON-005 page render | BLOCKED (queues) | BullMQ Redis :6380 unavailable |
| Console: catalog (products create/update/publish/delete, duplicate SKU, plan quota) | Yes | WF-001..004, WF-002, RBAC-006 | PASS | |
| Console: categories, brands, tax, attributes, media upload, product import/export | Yes | CON-010 (page render) | NOT_TESTED / media BLOCKED (S3) / import-export BLOCKED (queue) | |
| Console: inventory (levels, adjust, movements, reservation audit) | Yes | WF-004/007/009/010, DB-006 | PASS | transfer / low-stock: NOT_TESTED |
| Console: orders (list/get/cancel, state machine, isolation) | Yes | WF-006..011, TEN | PASS (API) / **FAIL (UI)** | BUG-003: /orders page crashes on direct load |
| Console: fulfil/hold/resume/close, shipments, returns/RMA, refunds | Yes | — | NOT_TESTED | need shipping/payment sandbox flows |
| Console: customers, addresses, wishlist | Yes | TEN-002/003, CON-010 | PASS (read/isolation) / NOT_TESTED (write) | |
| Console: coupons, gift cards, loyalty, reviews | Yes | TEN-005, SF-020/021, SEC-011 | PASS (coupon CRUD/isolation, validate at cart) / NOT_TESTED (gift-card issue, loyalty, reviews) | loyalty earn/redeem not wired into checkout (code review SUS-004) |
| Console: subscription / billing checkout | Yes | CON-010 | **FAIL** | BUG-004 /subscription crashes when no subscription |
| Recurring billing, trial expiry, dunning execution | **Not wired** | code review | NOT_IMPLEMENTED | no processor for SUBSCRIPTION_BILLING queue |
| Signup -> plan selection -> provisioning saga -> store setup | Yes (saga) | — | BLOCKED | needs BullMQ Redis :6380 + SMTP; `register` would create a tenant |
| Themes / theme studio / CMS / banners / menus / SEO (company) | Yes | CON-010 page render | NOT_TESTED (functional) | |
| Custom domains / SSL (ACME/DNS) | Yes | CON-010 page render | NOT_TESTED | needs DNS/ACME |
| Marketplace (shares/commission/settlement), Channels (eBay + stub; others throw "not yet implemented") | Partial | — | NOT_TESTED / NOT_IMPLEMENTED (Amazon, Flipkart, Meta, WhatsApp, Google) | |
| Notifications (email real, SMS/WhatsApp/push stubbed), reports, analytics, support tickets | Partial | — | BLOCKED (queue/SMTP) / NOT_TESTED | |
| Storefront catalogue: list, pagination, sorting, search, detail, categories, banners, theme assignment | Yes | SF-001..009, STO-002 | PASS | `/storefront/theme` 404 (BUG-013 suspected) |
| Storefront cart + coupon + pricing + COD checkout + idempotency + oversell guard | Yes | SF-010..022, WF-006..012 | PASS (merchant-created products) / **FAIL (seeded products)** | BUG-001 |
| Storefront payments: COD | Yes | WF-006 | PASS | stub/real gateways (Razorpay, Stripe, PayPal, Cashfree, PhonePe): NOT_TESTED — no sandbox credentials; never mocked as proof |
| Storefront customer accounts (register/login/orders/returns) | Yes | SF-023/024, STO-006/007 (auth gating, forms) | NOT_TESTED (flows) | creating customers/emails not exercised |
| Storefront web UI (home, products, detail, cart, checkout, auth pages, responsive) | Yes | STO-001..010 | PASS / **FAIL (STO-003 hydration, BUG-007)** | |
| Marketing website (6 routes x 3 viewports, nav, links, mobile menu, SEO, dynamic content, XSS) | Yes | MKT-001..009 | PASS / FAIL (BUG-010, BUG-011) | contact form does not exist -> NOT_IMPLEMENTED |
| API contract (envelope, correlation id, 422 details, pagination bounds, malformed body) | Yes | API-001..005 | PASS / FAIL (BUG-008) | |
| Database integrity (migrations, tenant FK consistency, orphans, uniqueness, inventory invariants, money, hashing) | Yes | DB-001..012 | PASS / FAIL (DB-012 = BUG-001) | read-only |
| Security: headers, CORS, SQLi, IDOR, mass assignment, JWKS, error leakage | Yes | SEC-001..011 | PASS / FAIL (SEC-007 = BUG-009) | |
| Security: **rate limiting** | **No** | SEC-012/013 | FAIL (NOT_IMPLEMENTED) | BUG-002 |
| Observability: /metrics, health | Yes | ENV-001/002/007/008 | PASS (health) / **FAIL (/metrics 500, BUG-006)** | |
| Product unit tests (api jest 25 suites / 206 tests, kernel 33 tests) | Yes | executed | PASS | integration tier does not exist; isolation + e2e jest tiers BLOCKED |
| Frontend unit tests (console/storefront/marketing/contracts) | No | — | NOT_IMPLEMENTED | `--passWithNoTests` |
| Load / performance / backup-restore / rolling restart / Docker / k6 | n/a | — | NOT_TESTED | out of scope for safe local run |
