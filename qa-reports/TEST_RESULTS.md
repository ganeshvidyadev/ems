# EMS QA — Test Results

Generated: 2026-10-09T16:40:36.753Z (local environment, API/console/storefront/marketing dev servers, MySQL 8.4 :3307, Mongo :27017, cache Redis cloud). Source of truth: `qa-reports/results.json` + raw spec output in `qa-reports/raw/`.

## Execution summary — black-box QA suite (`qa/`)

| Metric | Result |
|---|---|
| Total Test Cases (counted) | 187 |
| Passed | 171 |
| Failed | 15 |
| Blocked | 1 |
| Not Tested | 0 |
| Pass rate (PASS / (PASS + FAIL), executed only) | 91.9% |
| Critical Bugs (confirmed) | 0 |
| High Bugs (confirmed) | 3 |
| Medium Bugs (confirmed) | 4 |
| Low Bugs (confirmed) | 5 |

Blocked and Not Tested are shown separately and are **not** in the pass rate. 8 informational probes are listed below but not counted as pass/fail evidence.

## Existing product tests (executed this run)

| Suite | Result |
|---|---|
| apps/api jest unit tier (`test/jest-unit.json`) | PASS — 206/206 tests, 25 suites |
| packages/kernel Money spec | PASS — 33/33 tests, 1 suites |
| apps/api jest **integration** tier | NOT_IMPLEMENTED — `test/integration/` directory does not exist (0 specs) |
| apps/api jest **tenant-isolation** tier (`test:isolation`) | BLOCKED — needs a clean `ems_test` database + queue Redis :6380 (unavailable); not run |
| apps/api jest **e2e** tier (`test:e2e`) | BLOCKED — same prerequisites; not run |
| contracts / console / storefront / marketing unit tests | NOT_IMPLEMENTED — no spec files in these packages |
| typecheck (contracts, api, console, marketing) | PASS (run earlier this session; no errors) |
| lint (api, console) | FAIL — pre-existing: api 7 errors/3 warnings, console errors in unrelated files (see BUG_REPORT OBS-002); marketing lint PASS |

## Results by area

| Area | Pass | Fail | Blocked | Not tested | Pass rate |
|---|---|---|---|---|---|
| Environment & infrastructure | 8 | 1 | 1 | 0 | 88.9% |
| Authentication | 19 | 0 | 0 | 0 | 100.0% |
| Authorization / RBAC | 11 | 0 | 0 | 0 | 100.0% |
| Multi-tenant isolation | 12 | 1 | 0 | 0 | 92.3% |
| Website management module (API) | 22 | 0 | 0 | 0 | 100.0% |
| Storefront API | 22 | 2 | 0 | 0 | 91.7% |
| Merchant -> order workflow | 12 | 0 | 0 | 0 | 100.0% |
| API contract | 4 | 1 | 0 | 0 | 80.0% |
| Security | 9 | 3 | 0 | 0 | 75.0% |
| Database integrity | 8 | 1 | 0 | 0 | 88.9% |
| Marketing website (browser) | 21 | 4 | 0 | 0 | 84.0% |
| Admin console (browser) | 13 | 1 | 0 | 0 | 92.9% |
| Merchant storefront (browser) | 10 | 1 | 0 | 0 | 90.9% |

## Failed tests (after one automatic re-run)

| ID | Test | Re-run | Linked bug | Evidence |
|---|---|---|---|---|
| TEN-011b | unknown x-ems-hostname must not resolve to another tenant (KNOWN DEFECT BUG-005) | FAIL | BUG-005 |  |
| SF-017 | COD order placement succeeds, decrements/reserves stock, and is visible to the owning merchant only | FAIL | BUG-001 |  |
| SF-019 | merchant can cancel the QA order and stock is released (cleanup/restore) | FAIL | BUG-001 |  |
| API-005 | oversized body is rejected (not accepted/500) | FAIL | BUG-008 |  |
| SEC-007 | internal entity names are not exposed in client-facing error messages | FAIL | BUG-009 |  |
| SEC-012 | RATE LIMITING: 40 rapid unauthenticated gift-card lookups are throttled (HTTP 429) — enumeration protection | FAIL | BUG-002 |  |
| SEC-013 | RATE LIMITING: repeated failed logins for one unknown account are throttled or locked | FAIL | BUG-002 |  |
| MKT-001 | desktop /plans: loads, has title+h1, no JS errors/5xx, no horizontal overflow | FAIL | BUG-010 |  |
| MKT-001 | tablet /plans: loads, has title+h1, no JS errors/5xx, no horizontal overflow | FAIL | BUG-010 |  |
| MKT-001 | mobile /plans: loads, has title+h1, no JS errors/5xx, no horizontal overflow | FAIL | BUG-010 |  |
| MKT-006 | SEO: per-page meta descriptions differ (sub-pages should not all reuse the home description) | FAIL | BUG-011 |  |
| CON-010 | company pages render for the merchant without JS errors/5xx (results saved) | FAIL | BUG-003 |  |
| STO-003 | product detail page renders name, price and an add-to-cart control | FAIL | BUG-007 |  |
| DB-012 | seeded SIMPLE products must have inventory at the product level (variant_id NULL) so they can be purchased | FAIL | BUG-001 |  |
| ENV-008 | Prometheus /metrics endpoint serves text (observability) | FAIL | BUG-006 |  |

## Blocked / not tested

| ID | Reason |
|---|---|
| SEC-014 NOT_TESTED | NOT_TESTED: would lock a shared demo account for 15 minutes; verified by reading auth.service.ts (5 failures / 15 min) |
| ENV-005 BLOCKED | BLOCKED: BullMQ Redis on 127.0.0.1:6380 is unavailable; queue-dependent tests are BLOCKED, not FAILED |

## Informational probes (not counted)

- TEN-013: bare localhost dev fallback (informational)
- SF-025: GET /storefront/theme for the seeded tenant (INFO: 404 means no row in tenant_themes; theme-assignment still serves)
- SEC-010: Swagger/metrics exposure on this (dev) instance is reported, must be disabled/protected in production
- SEC-014: account lockout exists for a real account after repeated failures (uses a throwaway invite-free check: informational)
- MKT-008: Contact page: mailto link matches configured email; there is no contact form (NOT_IMPLEMENTED)
- DB-008: reservation ledger consistency: reserved quantity equals open allocations of non-cancelled, unfulfilled orders (informational drift check)
- DB-009: soft deletion: soft-deleted products are absent from public API and live listings
- DB-011: schema drift between TypeORM entities and live schema (informational; migrations are hand-written)

## Full list

| ID | Status | Test | File |
|---|---|---|---|
| AUTH-001 | PASS | superAdmin can log in and /auth/me returns own identity | api/01-auth.test.mjs |
| AUTH-001 | PASS | nwOwner can log in and /auth/me returns own identity | api/01-auth.test.mjs |
| AUTH-001 | PASS | nwOps can log in and /auth/me returns own identity | api/01-auth.test.mjs |
| AUTH-001 | PASS | lsOwner can log in and /auth/me returns own identity | api/01-auth.test.mjs |
| AUTH-001 | PASS | lsOps can log in and /auth/me returns own identity | api/01-auth.test.mjs |
| AUTH-002 | PASS | login response never leaks password hash / secrets | api/01-auth.test.mjs |
| AUTH-003 | PASS | wrong password for unknown account is rejected with 401 and generic error | api/01-auth.test.mjs |
| AUTH-004 | PASS | wrong password for a real account (single attempt) is 401, same shape as unknown account | api/01-auth.test.mjs |
| AUTH-005 | PASS | login with missing fields -> 422 validation envelope | api/01-auth.test.mjs |
| AUTH-006 | PASS | protected endpoint without token -> 401 | api/01-auth.test.mjs |
| AUTH-007 | PASS | malformed / garbage bearer token -> 401 | api/01-auth.test.mjs |
| AUTH-008 | PASS | tampered JWT payload (privilege escalation attempt) -> 401 | api/01-auth.test.mjs |
| AUTH-009 | PASS | alg=none JWT is rejected | api/01-auth.test.mjs |
| AUTH-010 | PASS | access token carries expected claims and a short TTL | api/01-auth.test.mjs |
| AUTH-011 | PASS | logout invalidates the access token (denylist) | api/01-auth.test.mjs |
| AUTH-012 | PASS | refresh without a refresh cookie is rejected | api/01-auth.test.mjs |
| AUTH-013 | PASS | refresh cookie is HttpOnly (session security) | api/01-auth.test.mjs |
| AUTH-014 | PASS | register with invalid payload -> 422, not 500 | api/01-auth.test.mjs |
| AUTH-015 | PASS | forgot-password does not reveal whether an account exists | api/01-auth.test.mjs |
| RBAC-001 | PASS | nwOwner is forbidden from every /platform/* read | api/02-rbac.test.mjs |
| RBAC-001 | PASS | nwOps is forbidden from every /platform/* read | api/02-rbac.test.mjs |
| RBAC-001 | PASS | lsOwner is forbidden from every /platform/* read | api/02-rbac.test.mjs |
| RBAC-001 | PASS | lsOps is forbidden from every /platform/* read | api/02-rbac.test.mjs |
| RBAC-002 | PASS | merchant owner cannot write platform website content | api/02-rbac.test.mjs |
| RBAC-003 | PASS | merchant owner cannot create/modify platform plans, tenants or staff | api/02-rbac.test.mjs |
| RBAC-004 | PASS | super admin (platform user, no tenant) is not granted tenant /console/* data | api/02-rbac.test.mjs |
| RBAC-005 | PASS | ORDER_MANAGER / PRODUCT_MANAGER roles are least-privilege | api/02-rbac.test.mjs |
| RBAC-006 | PASS | ORDER_MANAGER cannot create products or coupons (write separation) | api/02-rbac.test.mjs |
| RBAC-007 | PASS | public endpoints stay public: /plans and /website/content need no token | api/02-rbac.test.mjs |
| RBAC-008 | PASS | impersonation is super-admin only | api/02-rbac.test.mjs |
| TEN-001 | PASS | tokens carry different tenant ids | api/03-tenant-isolation.test.mjs |
| TEN-002 | PASS | Northwind has data; Lakeside list endpoints show none of it | api/03-tenant-isolation.test.mjs |
| TEN-003 | PASS | Lakeside cannot read Northwind records by id (404) | api/03-tenant-isolation.test.mjs |
| TEN-004 | PASS | Lakeside cannot MODIFY or DELETE Northwind records (IDOR write) | api/03-tenant-isolation.test.mjs |
| TEN-005 | PASS | Northwind cannot see or touch the Lakeside fixture coupon | api/03-tenant-isolation.test.mjs |
| TEN-006 | PASS | tenant switching via request headers/query is ignored (token tenant wins) | api/03-tenant-isolation.test.mjs |
| TEN-007 | PASS | foreign storeId in body is rejected when creating a product | api/03-tenant-isolation.test.mjs |
| TEN-008 | PASS | merchant tokens cannot reach tenant data through /platform tenant routes | api/03-tenant-isolation.test.mjs |
| TEN-009 | PASS | storefront resolves each hostname to its own tenant | api/03-tenant-isolation.test.mjs |
| TEN-010 | PASS | storefront product list is tenant-scoped by host | api/03-tenant-isolation.test.mjs |
| TEN-011a | PASS | unknown real Host header is rejected (no tenant fall-through) | api/03-tenant-isolation.test.mjs |
| TEN-011b | FAIL | unknown x-ems-hostname must not resolve to another tenant (KNOWN DEFECT BUG-005) | api/03-tenant-isolation.test.mjs |
| TEN-012 | PASS | client-supplied tenant slug header cannot override the host (spoof) | api/03-tenant-isolation.test.mjs |
| TEN-013 | PASS (info) | bare localhost dev fallback (informational) | api/03-tenant-isolation.test.mjs |
| WEB-001 | PASS | admin can read all 9 editable sections | api/04-website-module.test.mjs |
| WEB-002 | PASS | public endpoint needs no token and matches admin view | api/04-website-module.test.mjs |
| WEB-003 | PASS | hero update is validated, persisted to website_content, and served publicly | api/04-website-module.test.mjs |
| WEB-004 | PASS | partial update leaves other sections untouched | api/04-website-module.test.mjs |
| WEB-005 | PASS | features.heading round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-005 | PASS | products.heading round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-005 | PASS | plansDisplay.heading round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-005 | PASS | about.heading round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-005 | PASS | career.heading round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-005 | PASS | header.logoText round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-005 | PASS | footer.tagline round-trips through admin PUT -> public GET | api/04-website-module.test.mjs |
| WEB-006 | PASS | invalid hero (empty CTA label) -> 422 and nothing saved | api/04-website-module.test.mjs |
| WEB-007 | PASS | invalid feature icon / accent enum -> 422 | api/04-website-module.test.mjs |
| WEB-008 | PASS | length limits enforced (hero title > 120 chars) | api/04-website-module.test.mjs |
| WEB-009 | PASS | max-items limit enforced (13 feature cards) | api/04-website-module.test.mjs |
| WEB-010 | PASS | wrong types / non-object body rejected, never 500 | api/04-website-module.test.mjs |
| WEB-011 | PASS | unauthenticated and merchant users cannot modify content | api/04-website-module.test.mjs |
| WEB-012 | PASS | unknown sections are not persisted as new rows | api/04-website-module.test.mjs |
| WEB-013 | PASS | stored XSS payload is returned as inert JSON text (rendering is checked in E2E) | api/04-website-module.test.mjs |
| WEB-014 | PASS | pricing is sourced from /plans API, not duplicated static data | api/04-website-module.test.mjs |
| WEB-015 | PASS | plan name/price shown by /plans match the plans table in MySQL | api/04-website-module.test.mjs |
| WEB-016 | PASS | restore: original content is back after the run (verified in after-hook, asserted here for current state) | api/04-website-module.test.mjs |
| SF-001 | PASS | product listing returns paginated envelope with meta.pagination | api/05-storefront-workflow.test.mjs |
| SF-002 | PASS | pagination pages do not overlap | api/05-storefront-workflow.test.mjs |
| SF-003 | PASS | sorting by priceMinor orders ascending / descending correctly | api/05-storefront-workflow.test.mjs |
| SF-004 | PASS | invalid sort / limit / page -> 422 with validation details (not 500) | api/05-storefront-workflow.test.mjs |
| SF-005 | PASS | search finds products by name (incl. short queries) and is case-insensitive | api/05-storefront-workflow.test.mjs |
| SF-006 | PASS | SQL-injection style search strings are inert (200, no 500, no data bleed) | api/05-storefront-workflow.test.mjs |
| SF-007 | PASS | product detail by slug; unknown slug -> 404 envelope | api/05-storefront-workflow.test.mjs |
| SF-008 | PASS | storefront never exposes unpublished/draft products or cost price | api/05-storefront-workflow.test.mjs |
| SF-009 | PASS | categories, banners, theme and menus endpoints serve for the tenant | api/05-storefront-workflow.test.mjs |
| SF-010 | PASS | cart: create requires storeId; unknown cart id -> 404/409, not 500 | api/05-storefront-workflow.test.mjs |
| SF-011 | PASS | cart add / update / remove item round trip | api/05-storefront-workflow.test.mjs |
| SF-012 | PASS | cart rejects invalid quantities and foreign product ids | api/05-storefront-workflow.test.mjs |
| SF-013 | PASS | cart is isolated by tenant host (cannot be read through another tenant host) | api/05-storefront-workflow.test.mjs |
| SF-014 | PASS | checkout pricing returns consistent money breakdown (total = subtotal - discount + shipping + tax) | api/05-storefront-workflow.test.mjs |
| SF-015 | PASS | order validation: missing address / bad gateway / empty cart rejected | api/05-storefront-workflow.test.mjs |
| SF-016 | PASS | placing an order without an Idempotency-Key is rejected (400) | api/05-storefront-workflow.test.mjs |
| SF-017 | FAIL | COD order placement succeeds, decrements/reserves stock, and is visible to the owning merchant only | api/05-storefront-workflow.test.mjs |
| SF-018 | PASS | cart is emptied/consumed after order and cannot be reused to double-order | api/05-storefront-workflow.test.mjs |
| SF-019 | FAIL | merchant can cancel the QA order and stock is released (cleanup/restore) | api/05-storefront-workflow.test.mjs |
| SF-020 | PASS | coupon applies to cart and invalid coupon is rejected | api/05-storefront-workflow.test.mjs |
| SF-021 | PASS | gift card balance check returns balance for a valid code and valid:false otherwise | api/05-storefront-workflow.test.mjs |
| SF-025 | PASS (info) | GET /storefront/theme for the seeded tenant (INFO: 404 means no row in tenant_themes; theme-assignment still serves) | api/05-storefront-workflow.test.mjs |
| SF-022 | PASS | cannot order more than available stock (oversell guard) | api/05-storefront-workflow.test.mjs |
| SF-023 | PASS | customer account endpoints require a storefront token | api/05-storefront-workflow.test.mjs |
| SF-024 | PASS | a merchant JWT is not accepted as a storefront customer token | api/05-storefront-workflow.test.mjs |
| WF-001 | PASS | merchant creates a SIMPLE product (draft) via console API | api/06-merchant-to-order-workflow.test.mjs |
| WF-002 | PASS | duplicate SKU in the same tenant is rejected (409/422) | api/06-merchant-to-order-workflow.test.mjs |
| WF-003 | PASS | draft product is NOT visible on the public storefront | api/06-merchant-to-order-workflow.test.mjs |
| WF-004 | PASS | merchant adds stock (inventory adjust) and publishes the product | api/06-merchant-to-order-workflow.test.mjs |
| WF-005 | PASS | published product is visible on the Northwind storefront with correct price | api/06-merchant-to-order-workflow.test.mjs |
| WF-006 | PASS | customer cart -> pricing -> COD order succeeds for a merchant-created product | api/06-merchant-to-order-workflow.test.mjs |
| WF-007 | PASS | order is consistent: stock reserved, totals add up, status COD pending/confirmed | api/06-merchant-to-order-workflow.test.mjs |
| WF-008 | PASS | order appears in merchant order list but never for Lakeside | api/06-merchant-to-order-workflow.test.mjs |
| WF-009 | PASS | inventory movement is recorded for the reservation (audit trail) | api/06-merchant-to-order-workflow.test.mjs |
| WF-010 | PASS | cancelling releases stock (full restore) | api/06-merchant-to-order-workflow.test.mjs |
| WF-011 | PASS | cannot cancel an already cancelled order twice (state machine) | api/06-merchant-to-order-workflow.test.mjs |
| WF-012 | PASS | after the order is cancelled the same product can no longer exceed stock (11 > 10 rejected) | api/06-merchant-to-order-workflow.test.mjs |
| API-001 | PASS | every error response uses the {success:false,error:{code,message},meta} envelope with a correlation id | api/07-security-contract.test.mjs |
| API-002 | PASS | unknown route returns a JSON 404, not an HTML/stack page | api/07-security-contract.test.mjs |
| API-003 | PASS | list endpoints honour pagination limits and reject out-of-range values | api/07-security-contract.test.mjs |
| API-004 | PASS | malformed JSON body -> 4xx (not 500) | api/07-security-contract.test.mjs |
| API-005 | FAIL | oversized body is rejected (not accepted/500) | api/07-security-contract.test.mjs |
| SEC-001 | PASS | security headers present on API responses (nosniff, no X-Powered-By) | api/07-security-contract.test.mjs |
| SEC-002 | PASS | CORS: a hostile origin is not reflected / credentialed | api/07-security-contract.test.mjs |
| SEC-003 | PASS | CORS preflight from hostile origin does not authorise credentials | api/07-security-contract.test.mjs |
| SEC-004 | PASS | SQL injection in login email/password does not authenticate or 500 | api/07-security-contract.test.mjs |
| SEC-005 | PASS | SQL injection in filter/sort params on console list is inert | api/07-security-contract.test.mjs |
| SEC-006 | PASS | error responses do not leak stack traces, SQL or file paths | api/07-security-contract.test.mjs |
| SEC-007 | FAIL | internal entity names are not exposed in client-facing error messages | api/07-security-contract.test.mjs |
| SEC-008 | PASS | IDOR: one merchant cannot revoke another user's session | api/07-security-contract.test.mjs |
| SEC-009 | PASS | JWKS publishes only public key material | api/07-security-contract.test.mjs |
| SEC-010 | PASS (info) | Swagger/metrics exposure on this (dev) instance is reported, must be disabled/protected in production | api/07-security-contract.test.mjs |
| SEC-011 | PASS | mass assignment: client-supplied tenantId / role fields are ignored on update | api/07-security-contract.test.mjs |
| SEC-012 | FAIL | RATE LIMITING: 40 rapid unauthenticated gift-card lookups are throttled (HTTP 429) — enumeration protection | api/07-security-contract.test.mjs |
| SEC-013 | FAIL | RATE LIMITING: repeated failed logins for one unknown account are throttled or locked | api/07-security-contract.test.mjs |
| SEC-014 | NOT_TESTED (info) | account lockout exists for a real account after repeated failures (uses a throwaway invite-free check: informational) | api/07-security-contract.test.mjs |
| MKT-001 | PASS | desktop /: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | desktop /products: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | FAIL | desktop /plans: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | desktop /about: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | desktop /careers: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | desktop /contact: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | tablet /: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | tablet /products: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | FAIL | tablet /plans: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | tablet /about: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | tablet /careers: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | tablet /contact: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | mobile /: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | mobile /products: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | FAIL | mobile /plans: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | mobile /about: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | mobile /careers: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-001 | PASS | mobile /contact: loads, has title+h1, no JS errors/5xx, no horizontal overflow | e2e/01-marketing.test.mjs |
| MKT-002 | PASS | header and footer navigation: all internal links resolve (no broken links) | e2e/01-marketing.test.mjs |
| MKT-003 | PASS | home page: header has the 5 configured nav links and the footer shows copyright | e2e/01-marketing.test.mjs |
| MKT-004 | PASS | mobile: hamburger menu is hidden by default and toggles the nav | e2e/01-marketing.test.mjs |
| MKT-005 | PASS | SEO: <html lang>, meta description, title template on sub-pages | e2e/01-marketing.test.mjs |
| MKT-006 | FAIL | SEO: per-page meta descriptions differ (sub-pages should not all reuse the home description) | e2e/01-marketing.test.mjs |
| MKT-007 | PASS | Plans page shows exactly the public plans from the plans API (name, price, features) | e2e/01-marketing.test.mjs |
| MKT-008 | PASS (info) | Contact page: mailto link matches configured email; there is no contact form (NOT_IMPLEMENTED) | e2e/01-marketing.test.mjs |
| MKT-009 | PASS | admin edits -> marketing site updates (cache-aware, <=120s); XSS payload is rendered inert; content restored | e2e/01-marketing.test.mjs |
| CON-001 | PASS | login page renders form; empty submit is blocked by validation | e2e/02-console.test.mjs |
| CON-002 | PASS | wrong password shows an error and does not authenticate | e2e/02-console.test.mjs |
| CON-003 | PASS | protected route redirects an unauthenticated visitor to /login?next= | e2e/02-console.test.mjs |
| CON-004 | PASS | super admin lands in the Super Admin shell with the full platform nav | e2e/02-console.test.mjs |
| CON-005 | PASS | every super-admin page renders without JS errors or 5xx (4xx/blocked recorded to console-routes.json) | e2e/02-console.test.mjs |
| CON-006 | PASS | Website module: 9 tabs; editing Hero in the UI saves, validates, persists, and reaches the public API | e2e/02-console.test.mjs |
| CON-007 | PASS | Plans page lists the real plans from the API | e2e/02-console.test.mjs |
| CON-008 | PASS | merchant (Northwind owner) gets the company shell, never the platform nav | e2e/02-console.test.mjs |
| CON-009 | PASS | merchant typing a super-admin URL sees no platform data (API 403 enforced behind the UI) | e2e/02-console.test.mjs |
| CON-010 | FAIL | company pages render for the merchant without JS errors/5xx (results saved) | e2e/02-console.test.mjs |
| CON-011 | PASS | UI tenant isolation: Northwind products visible to Northwind owner, absent for Lakeside owner | e2e/02-console.test.mjs |
| CON-012 | PASS | responsive: login + super admin home usable at tablet (no horizontal overflow) | e2e/02-console.test.mjs |
| CON-012 | PASS | responsive: login + super admin home usable at mobile (no horizontal overflow) | e2e/02-console.test.mjs |
| CON-013 | PASS | logout from the UI ends the session and protected pages redirect again | e2e/02-console.test.mjs |
| STO-001 | PASS | Northwind storefront home renders its brand, products and no JS errors/5xx | e2e/03-storefront.test.mjs |
| STO-002 | PASS | product listing page shows the 12 seeded Northwind products | e2e/03-storefront.test.mjs |
| STO-003 | FAIL | product detail page renders name, price and an add-to-cart control | e2e/03-storefront.test.mjs |
| STO-004 | PASS | unknown product slug shows a not-found page (not a crash) | e2e/03-storefront.test.mjs |
| STO-005 | PASS | cart page and checkout page load (empty cart state handled) | e2e/03-storefront.test.mjs |
| STO-006 | PASS | customer auth pages render forms and validate empty submit | e2e/03-storefront.test.mjs |
| STO-007 | PASS | account pages require login (redirect or gate) for an anonymous visitor | e2e/03-storefront.test.mjs |
| STO-008 | PASS | Lakeside host never renders Northwind branding or products | e2e/03-storefront.test.mjs |
| STO-009 | PASS | responsive: Northwind home and products have no horizontal overflow at tablet | e2e/03-storefront.test.mjs |
| STO-009 | PASS | responsive: Northwind home and products have no horizontal overflow at mobile | e2e/03-storefront.test.mjs |
| STO-010 | PASS | browser add-to-cart flow: product -> cart shows the item (BUY-flow UI) | e2e/03-storefront.test.mjs |
| DB-001 | PASS | applied migrations match the migration files on disk (no pending / unknown) | api/08-db-integrity.test.mjs |
| DB-002 | PASS | every tenant-scoped table has a NOT NULL tenant_id except the documented nullable ones | api/08-db-integrity.test.mjs |
| DB-003 | PASS | cross-tenant referential consistency: child rows belong to the same tenant as their parent | api/08-db-integrity.test.mjs |
| DB-004 | PASS | no orphan rows for key relations (FK integrity) | api/08-db-integrity.test.mjs |
| DB-005 | PASS | unique constraints hold: no duplicate (tenant, SKU) among live products, no duplicate order numbers | api/08-db-integrity.test.mjs |
| DB-006 | PASS | inventory invariants: on_hand >= 0, reserved >= 0, available = on_hand - reserved, reserved <= on_hand | api/08-db-integrity.test.mjs |
| DB-007 | PASS | order money: total = subtotal - discount + shipping + tax + cod_fee (+ round_off) for every order | api/08-db-integrity.test.mjs |
| DB-008 | PASS (info) | reservation ledger consistency: reserved quantity equals open allocations of non-cancelled, unfulfilled orders (informational drift check) | api/08-db-integrity.test.mjs |
| DB-009 | PASS (info) | soft deletion: soft-deleted products are absent from public API and live listings | api/08-db-integrity.test.mjs |
| DB-010 | PASS | passwords are stored hashed (bcrypt) and no plaintext demo password is in the users table | api/08-db-integrity.test.mjs |
| DB-011 | PASS (info) | schema drift between TypeORM entities and live schema (informational; migrations are hand-written) | api/08-db-integrity.test.mjs |
| DB-012 | FAIL | seeded SIMPLE products must have inventory at the product level (variant_id NULL) so they can be purchased | api/08-db-integrity.test.mjs |
| ENV-001 | PASS | API liveness | api/00-environment.test.mjs |
| ENV-002 | PASS | API readiness: MySQL, Mongo and cache Redis report up | api/00-environment.test.mjs |
| ENV-003 | PASS | MySQL port 3307 reachable | api/00-environment.test.mjs |
| ENV-004 | PASS | MongoDB port 27017 reachable | api/00-environment.test.mjs |
| ENV-005 | BLOCKED | BullMQ Redis (6380) availability | api/00-environment.test.mjs |
| ENV-006 | PASS | console frontend serves HTTP 200 | api/00-environment.test.mjs |
| ENV-006 | PASS | marketing frontend serves HTTP 200 | api/00-environment.test.mjs |
| ENV-006 | PASS | storefront(northwind) frontend serves HTTP 200 | api/00-environment.test.mjs |
| ENV-007 | PASS | Swagger docs reachable | api/00-environment.test.mjs |
| ENV-008 | FAIL | Prometheus /metrics endpoint serves text (observability) | api/00-environment.test.mjs |
