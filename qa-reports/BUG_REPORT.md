# EMS QA — Bug Report

Every bug below was reproduced by an executed test or probe in this run unless marked **SUSPECTED**. Confirmed cross-tenant data exposure would be CRITICAL: **none was found** (see SECURITY_FINDINGS.md). No product code was changed.

| ID | Severity | Status | Module | Title | Tests |
|---|---|---|---|---|---|
| BUG-001 | High | CONFIRMED | Inventory / Seed data / Checkout | Every seeded Northwind product is impossible to purchase (checkout returns INVENTORY_INSUFFICIENT with available=0 although 145 units are in stock) | SF-017, SF-019, DB-012 |
| BUG-002 | High | CONFIRMED | Security / Rate limiting | No HTTP rate limiting exists: unauthenticated gift-card lookups and failed logins for unknown accounts are unthrottled | SEC-012, SEC-013 |
| BUG-003 | High | CONFIRMED | Admin console / Orders | Merchant Orders page crashes with "Rendered more hooks than during the previous render" on direct load (reproduced 4 of 6 loads) | CON-010 |
| BUG-004 | Medium | CONFIRMED | Admin console / Subscription | Merchant Subscription page crashes (client-side exception) when the tenant has no subscription | CON-010 |
| BUG-005 | Medium | CONFIRMED | Tenant resolution (storefront) | Unknown `x-ems-hostname` resolves to the first active tenant (Northwind) instead of 404 when the API is reached via a dev host | TEN-011b |
| BUG-006 | Medium | CONFIRMED | Observability | GET /metrics returns HTTP 500 ("Value is not a valid number: 182") so Prometheus scraping is broken | ENV-008 |
| BUG-007 | Medium | NOT REPRODUCED (intermittent or fixed) | Storefront web | Storefront product detail page logs a React hydration mismatch error on every load | STO-003 |
| BUG-008 | Low | CONFIRMED | API error handling | Request body above the size limit returns 500 INTERNAL_ERROR instead of 413 | API-005 |
| BUG-009 | Low | CONFIRMED | API error handling / info exposure | Client-facing error leaks internal class names ("Operation 'StoreEntity query' requires a tenant context") | SEC-007 |
| BUG-010 | Low | CONFIRMED | Marketing website / SEO & a11y | /plans page has no <h1> (section heading is an <h2>) | MKT-001 |
| BUG-011 | Low | CONFIRMED | Marketing website / SEO | All six marketing pages share the same <meta name=description> | MKT-006 |
| BUG-012 | Low | CONFIRMED | Admin console / Super-admin shell | Every super-admin page triggers a tenant-only API call that is always 403 (`GET /console/inventory/low-stock`) | — |
| BUG-013 | Low | SUSPECTED | Storefront theme | GET /storefront/theme returns 404 'Published theme for this store not found' for the seeded Northwind store | SF-025 |

---

## BUG-001 — Every seeded Northwind product is impossible to purchase (checkout returns INVENTORY_INSUFFICIENT with available=0 although 145 units are in stock)

- **Module:** Inventory / Seed data / Checkout
- **Severity:** High
- **Status:** CONFIRMED
- **API endpoint / UI route:** `POST /api/v1/storefront/checkout/orders`
- **Preconditions:** Fresh `pnpm seed` data. Northwind storefront, any seeded product, COD, qty 1.
- **Reproduction steps:**
  1. GET /storefront/products on host northwind.ems.localhost; pick any product (all 12 are type SIMPLE).
  2. POST /storefront/cart?storeId=<store>, add the product (qty 1) — accepted.
  3. POST /storefront/checkout/orders with Idempotency-Key, COD, valid address.
- **Expected result:** 201 with an order number; stock reserved.
- **Actual result:** 409 INVENTORY_INSUFFICIENT {"requested":1,"available":0}. 12/12 products fail, qty 1 and 3. Merchant-created products (console create + inventory adjust) order fine (WF-001..012 PASS).
- **Evidence / logs:** qa/api/05-storefront-workflow SF-017; DB: `inventory_levels.variant_id` = 1..12 for all seeded rows while the products are SIMPLE with no variants (storefront returns `variants: []`) and the order line sends `variantId: null`; `InventoryRepository.findSlot` filters `variant_id IS NULL` so no slot is found.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** `apps/api/src/database/seeds/seed-northwind-rich-data.ts` (~lines 390-425) creates a default ProductVariant per SIMPLE product and attaches the stock to `variantId: savedVariant.id`, but SIMPLE products are sold with `variantId = null`. Seed/data-model mismatch (not reproduced on merchant-created products).
- **Suggested fix:** Seed inventory for SIMPLE products with `variantId: null` (and do not create a default variant), or make cart/checkout resolve the sole default variant for SIMPLE products. Add a seed self-check that every ACTIVE product has a purchasable slot.
- **Regression test recommendation:** DB-012 + SF-017 (seeded product can be ordered end to end). Add a seed smoke test to CI.

## BUG-002 — No HTTP rate limiting exists: unauthenticated gift-card lookups and failed logins for unknown accounts are unthrottled

- **Module:** Security / Rate limiting
- **Severity:** High
- **Status:** CONFIRMED
- **API endpoint / UI route:** `POST /storefront/gift-cards/check-balance, POST /auth/login`
- **Preconditions:** None (anonymous).
- **Reproduction steps:**
  1. Send 40 rapid POST /storefront/gift-cards/check-balance with different codes.
  2. Send 12 wrong-password POST /auth/login for one non-existent email.
- **Expected result:** HTTP 429 (Retry-After) after a small burst; gift-card code enumeration is throttled.
- **Actual result:** All 40 return 201 (a `valid:true` + balance oracle for real codes, e.g. NW-GIFT-5000 -> ₹5,000.00); all 12 logins return 401, never 429/423.
- **Evidence / logs:** qa/api/07 SEC-012/013. Code review: `RATE_LIMIT_*` env vars are parsed but never consumed; `@nestjs/throttler` is a dependency that is never imported; only nginx (not active locally) rate limits. Account lockout (5 failures / 15 min) exists for real accounts (read in auth.service.ts; deliberately not exercised against shared demo accounts).
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Throttling was configured but never wired (also listed as an open P0 in PRODUCTION_READINESS_REPORT.md).
- **Suggested fix:** Add a Redis-backed throttler guard (IP + tenant + route class), strict on auth/*, storefront/auth/*, gift-cards/check-balance, reviews, checkout.
- **Regression test recommendation:** SEC-012, SEC-013 must pass; add per-endpoint limits tests.

## BUG-003 — Merchant Orders page crashes with "Rendered more hooks than during the previous render" on direct load (reproduced 4 of 6 loads)

- **Module:** Admin console / Orders
- **Severity:** High
- **Status:** CONFIRMED
- **API endpoint / UI route:** `/orders (console, company shell)`
- **Preconditions:** Logged in as owner@northwind.test; hard-load /orders (not client navigation).
- **Reproduction steps:**
  1. Log in.
  2. Navigate directly to /orders (page.goto) and wait 3 s; repeat.
- **Expected result:** Order list renders.
- **Actual result:** "Application error: a client-side exception has occurred" in 4/6 loads; pageerror `Rendered more hooks than during the previous render.`
- **Evidence / logs:** qa-reports/console-company-routes.json; probe run 4/6. `apps/console/src/app/(app)/orders/page.tsx` lines 85-86 call `useState` after an early `return` (`if (!store) return ...`) — also reported by `next lint` (react-hooks/rules-of-hooks).
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Conditional hooks: `useState` for isExporting/selectedOrderIds declared after the `if (!store)` early return; when `store` resolves between renders the hook count changes.
- **Suggested fix:** Move both `useState` calls above every early return (same fix pattern already applied to storefront MobileNav in commit 0da8c89).
- **Regression test recommendation:** CON-010 (/orders), plus enable the `react-hooks/rules-of-hooks` lint as a CI gate.

## BUG-004 — Merchant Subscription page crashes (client-side exception) when the tenant has no subscription

- **Module:** Admin console / Subscription
- **Severity:** Medium
- **Status:** CONFIRMED
- **API endpoint / UI route:** `/subscription (console, company shell); API GET /console/subscription -> 404`
- **Preconditions:** Tenant without a subscription row (both seeded demo tenants).
- **Reproduction steps:**
  1. Log in as owner@northwind.test.
  2. Open /subscription.
- **Expected result:** Empty state ("no active plan" with a plan chooser).
- **Actual result:** "Application error: a client-side exception has occurred"; page errors `Rendered more hooks than during the previous render` and `TypeError: Cannot read properties of undefined (reading 'replace')`. Deterministic.
- **Evidence / logs:** qa-reports/console-company-routes.json, probe screenshot. API 404 is returned for a missing subscription.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Unhandled 404/undefined subscription state plus conditional hooks in the subscription page (suspected: apps/console/src/app/(app)/subscription/page.tsx).
- **Suggested fix:** Treat 404 as 'no subscription', hoist hooks, guard `.replace` on undefined plan/status strings.
- **Regression test recommendation:** CON-010 (/subscription) with a tenant that has no subscription.

## BUG-005 — Unknown `x-ems-hostname` resolves to the first active tenant (Northwind) instead of 404 when the API is reached via a dev host

- **Module:** Tenant resolution (storefront)
- **Severity:** Medium
- **Status:** CONFIRMED
- **API endpoint / UI route:** `GET /api/v1/storefront/store and /storefront/products with header x-ems-hostname: qa-unknown-tenant.ems.localhost (Host: localhost)`
- **Preconditions:** API reached via localhost/127.0.0.1/ems.localhost (dev hosts).
- **Reproduction steps:**
  1. curl -H 'x-ems-hostname: qa-unknown-tenant.ems.localhost' http://localhost:4000/api/v1/storefront/store
- **Expected result:** 404/400 TENANT_CONTEXT_MISSING (same as a raw unknown Host header, which is correctly rejected: TEN-011a PASS).
- **Actual result:** 200 with Northwind Traders store and catalogue; `Host: localhost` alone also resolves to Northwind.
- **Evidence / logs:** qa/api/03 TEN-011b FAIL; probe output. Code: `tenant-resolver.middleware.ts` Fallback 2 (lines ~172-187) is not gated by NODE_ENV and runs when the *Host* is a dev host even if the forwarded hostname is unknown.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Dev-convenience fallback 'first ACTIVE tenant' is reachable in any environment and also triggers for unknown forwarded hostnames.
- **Suggested fix:** Gate Fallback 2 behind NODE_ENV!=='production' and only when no forwarded hostname was supplied; return 404 for an unknown forwarded hostname.
- **Regression test recommendation:** TEN-011a/011b/013.

## BUG-006 — GET /metrics returns HTTP 500 ("Value is not a valid number: 182") so Prometheus scraping is broken

- **Module:** Observability
- **Severity:** Medium
- **Status:** CONFIRMED
- **API endpoint / UI route:** `GET /metrics`
- **Preconditions:** METRICS_ENABLED=true.
- **Reproduction steps:**
  1. curl http://localhost:4000/metrics
- **Expected result:** 200 text/plain Prometheus exposition.
- **Actual result:** 500 INTERNAL_ERROR; context.detail: 'Value is not a valid number: 182' (a gauge is being set with a string).
- **Evidence / logs:** qa/api/00 ENV-008; probe output.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** A prom-client gauge/counter receives a numeric string (MySQL COUNT returned as string) instead of a number (suspected in the DB/queue gauge collectors).
- **Suggested fix:** Coerce with Number() before .set()/.inc(); add an e2e test hitting /metrics.
- **Regression test recommendation:** ENV-008.

## BUG-007 — Storefront product detail page logs a React hydration mismatch error on every load

- **Module:** Storefront web
- **Severity:** Medium
- **Status:** NOT REPRODUCED (intermittent or fixed)
- **API endpoint / UI route:** `http://northwind.ems.localhost:3001/products/<slug>`
- **Preconditions:** Any product.
- **Reproduction steps:**
  1. Open any product detail page with a fresh browser context; read the console.
- **Expected result:** No hydration errors.
- **Actual result:** pageerror 'Hydration failed because the server rendered HTML didn't match the client' (React regenerates the tree client-side; can cause flicker/lost state).
- **Evidence / logs:** qa/e2e/03 STO-003 FAIL (reproduced twice); dev-mode stack not narrowed to a component. | Re-run 2026-10-09 (22:2x-22:55 IST): STO-003 PASS in the full run and 3/3 isolated reruns; storefront source unchanged in git, so the earlier failure may have been dev-server/HMR state. Keep open until re-checked on a production build.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Suspected: client-only value (Date/locale formatting or window check) or invalid HTML nesting in the product detail tree.
- **Suggested fix:** Reproduce with `next build && next start`, bisect the detail components, gate client-only values behind useEffect.
- **Regression test recommendation:** STO-003.

## BUG-008 — Request body above the size limit returns 500 INTERNAL_ERROR instead of 413

- **Module:** API error handling
- **Severity:** Low
- **Status:** CONFIRMED
- **API endpoint / UI route:** `POST /api/v1/auth/login with a ~5 MB JSON body`
- **Preconditions:** None.
- **Reproduction steps:**
  1. POST a 5 MB body.
- **Expected result:** 413 Payload Too Large (or 400/422) in the standard envelope.
- **Actual result:** 500 INTERNAL_ERROR (`context.detail: request entity too large`) with correlationId 'unknown'.
- **Evidence / logs:** qa/api/07 API-005.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** GlobalExceptionFilter does not map body-parser's PayloadTooLargeError (status 413) and treats it as unexpected; error occurs before the correlation middleware.
- **Suggested fix:** Map `err.status/ type==='entity.too.large'` to 413 in the filter.
- **Regression test recommendation:** API-005.

## BUG-009 — Client-facing error leaks internal class names ("Operation 'StoreEntity query' requires a tenant context")

- **Module:** API error handling / info exposure
- **Severity:** Low
- **Status:** CONFIRMED
- **API endpoint / UI route:** `GET /api/v1/storefront/store with an unknown Host header`
- **Preconditions:** None.
- **Reproduction steps:**
  1. curl -H 'Host: evil.example.com' http://127.0.0.1:4000/api/v1/storefront/store
- **Expected result:** Generic message without ORM entity names.
- **Actual result:** 400 TENANT_CONTEXT_MISSING with the entity name and a `context` object.
- **Evidence / logs:** qa/api/07 SEC-007.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Error message built from the guarded repository operation.
- **Suggested fix:** Use a generic public message; log details server-side.
- **Regression test recommendation:** SEC-007.

## BUG-010 — /plans page has no <h1> (section heading is an <h2>)

- **Module:** Marketing website / SEO & a11y
- **Severity:** Low
- **Status:** CONFIRMED
- **API endpoint / UI route:** `http://localhost:3003/plans`
- **Preconditions:** None.
- **Reproduction steps:**
  1. Open /plans; inspect headings.
- **Expected result:** Exactly one <h1> per page (every other marketing page has one).
- **Actual result:** No <h1> (fails at desktop, tablet and mobile; reproduced on retry).
- **Evidence / logs:** qa/e2e/01 MKT-001 /plans x3.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** `apps/marketing/src/app/plans/page.tsx` renders `PlansSection` (h2) without a PageHero/h1.
- **Suggested fix:** Render PageHero (or promote the section heading to h1) on the dedicated /plans route.
- **Regression test recommendation:** MKT-001.

## BUG-011 — All six marketing pages share the same <meta name=description>

- **Module:** Marketing website / SEO
- **Severity:** Low
- **Status:** CONFIRMED
- **API endpoint / UI route:** `/, /products, /plans, /about, /careers, /contact`
- **Preconditions:** None.
- **Reproduction steps:**
  1. Read the meta description on each route.
- **Expected result:** A page-specific description per route.
- **Actual result:** One identical description everywhere (1 distinct value across 6 pages).
- **Evidence / logs:** qa/e2e/01 MKT-006.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Only the root layout defines `metadata.description`; sub-pages only set `title`.
- **Suggested fix:** Add `description` to each page's `metadata` (ideally from the website content).
- **Regression test recommendation:** MKT-006.

## BUG-012 — Every super-admin page triggers a tenant-only API call that is always 403 (`GET /console/inventory/low-stock`)

- **Module:** Admin console / Super-admin shell
- **Severity:** Low
- **Status:** CONFIRMED
- **API endpoint / UI route:** `All 21 super-admin routes (shell/notification widget)`
- **Preconditions:** Logged in as admin@ems.test.
- **Reproduction steps:**
  1. Open any /analytics, /tenants, ... page and watch network.
- **Expected result:** Platform shell does not call company endpoints.
- **Actual result:** 403 on every page; on the landing page also 403 for /console/stores and /console/customers. Noise in logs/audit, wasted requests.
- **Evidence / logs:** qa-reports/console-routes.json (executed CON-005 data).
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** Shared layout widget fetches low-stock regardless of user type.
- **Suggested fix:** Skip tenant queries when userType==='PLATFORM'.
- **Regression test recommendation:** Extend CON-005 to fail on unexpected 4xx.

## BUG-013 — GET /storefront/theme returns 404 'Published theme for this store not found' for the seeded Northwind store

- **Module:** Storefront theme
- **Severity:** Low
- **Status:** SUSPECTED
- **API endpoint / UI route:** `GET /api/v1/storefront/theme`
- **Preconditions:** Seed data.
- **Reproduction steps:**
  1. curl with Host northwind.ems.localhost.
- **Expected result:** 200 or a documented fallback.
- **Actual result:** 404 (theme-assignment endpoint returns `organic` correctly; the storefront renders, so a UI fallback exists).
- **Evidence / logs:** qa/api/05 SF-025 INFO. | Re-verified 2026-10-09: still 404 RESOURCE_NOT_FOUND on Host northwind.ems.localhost.
- **Screenshot / trace:** see `qa-reports/screenshots/` and `qa-reports/raw/`
- **Suspected root cause:** No published `tenant_themes` row for the seeded tenant; not confirmed to be user-visible.
- **Suggested fix:** Seed a published theme row or return the assigned theme.
- **Regression test recommendation:** SF-025.

---

## Suspected issues from code review (NOT reproduced — need verification)

These come from reading the code (API inventory), not from execution. They are not counted as confirmed bugs.

| ID | Sev (est.) | Suspicion | Where |
|---|---|---|---|
| SUS-001 | High | `PlatformTenantService.create` provisions the owner with the fixed password `DemoPassword123!` (email pre-verified, ACTIVE). Not exercised because it would create a tenant. | apps/api/src/modules/platform-tenant/platform-tenant.service.ts (~l.225) |
| SUS-002 | Medium | `POST /platform/tenants/:id/subscription/change-plan` requires `platform.plan:assign`, a permission missing from the catalogue, so no role can call it. | platform-tenant.controller.ts:125, permissions.seed.ts |
| SUS-003 | High | TenantStatusGuard skips @Public() routes, so a SUSPENDED/CANCELLED tenant's storefront and checkout keep serving. Not exercised (would suspend a demo tenant). | common/guards/tenant-status.guard.ts:49-56 |
| SUS-004 | Medium | Loyalty earn/redeem and gift-card reversal are not wired into checkout/cancel; order cancel does not refund captured money. | loyalty.service.ts, order.service.ts:92-166 |
| SUS-005 | Medium | Platform invoice-payment refund is bookkeeping only (no gateway call). | platform-billing.service.ts:111-135 |
| SUS-006 | Medium | Recurring subscription renewal/trial-expiry processors do not exist (SUBSCRIPTION_BILLING and 4 other queues have no processor). | queues/queue.module.ts |
| SUS-007 | Medium | Only one plan quota (`max_products`) is enforced; other limits and feature entitlements are not. | product.controller.ts:92 |
| SUS-008 | Low | route-exposure CI gate pins ~21 of ~63 public routes (stale allowlist). | test/unit/route-exposure.spec.ts |
| SUS-009 | Medium | Payment gateway credentials are platform-wide (no per-tenant merchant account). | integrations/payment/payment-gateway.factory.ts |

## Observations (not defects in behaviour)

- **OBS-001** TypeORM `schema:log` reports ~430 drift statements (index/FK names differ from the hand-written migrations). `synchronize` is off so there is no runtime impact, but `migration:generate` output would be noisy.
- **OBS-002** Pre-existing lint debt: apps/api (7 errors/3 warnings: `no-explicit-any`, unused vars) and apps/console (many errors incl. react-hooks/rules-of-hooks in orders/page.tsx = BUG-003).
- **OBS-003** During the run the API dev process exited silently once (no crash trace) and had to be restarted; cause unknown (not reproduced).
- **OBS-004** Login latency is high locally: 1–7 s per `POST /auth/login` (bcrypt cost 12 plus ~0.8 s round trip to the hosted Redis).
- **OBS-005** Dev-mode first request to each Next page triggers a compile (1–10 s) and occasionally one transient 404 on cold start (classified FLAKY, passes on retry).
- **OBS-006** Residue left by the run (cannot be hard-deleted through the API; verified in MySQL): 2 CANCELLED QA orders (stock released; seeded Northwind stock verified back at 1800 on-hand / 60 reserved), 3 soft-deleted QA products (+their inventory rows), 3 soft-deleted QA coupons in Lakeside. No live (non-deleted) QA product or coupon remains. Website content rows were removed again so the module is back to code defaults.

---

## Cycle 3 verification of BUG-001..013 (commit 177efa3)

| Bug | Verdict | Evidence |
|---|---|---|
| BUG-001 | verified-fixed | DB-012, SF-017, SF-019 PASS (seeded product orders; stock released on cancel) |
| BUG-002 | verified-fixed | gift-card 429 after 10 (SEC-012 PASS); login 429 after 30 in a parallel burst; SEC-013 passes on retry (flaky only because sequential login latency ~2 s) |
| BUG-003 | could-not-test (console down); code verified | hooks hoisted above early returns in orders/page.tsx |
| BUG-004 | could-not-test (console down); code verified | usage mapped to {key,used,limit}; page hooks all precede returns. Residual: with no subscription the page shows a fake "Standard Merchant / ACTIVE" |
| BUG-005 | verified-fixed | unknown x-ems-hostname -> 400 (TEN-011b PASS). Bare Host localhost with no forwarded host still resolves to Northwind (dev fallback, gated off in production) |
| BUG-006 | verified-fixed | /metrics 200 (ENV-008 PASS) |
| BUG-007 | could-not-test (storefront down); code verified | ProductShare reads navigator/window after mount |
| BUG-008 | verified-fixed | 30 MB body -> 413 (API-005 PASS). Nit: code is MALFORMED_REQUEST, correlationId still "unknown" |
| BUG-009 | verified-fixed | message is now generic (SEC-007 PASS) |
| BUG-010 | verified-fixed (desktop+tablet) | MKT-001 /plans PASS at desktop and tablet (h1 asserted); mobile run blocked |
| BUG-011 | could-not-test in browser; inputs verified | five distinct subheadings in /website/content feed generateMetadata; MKT-006 blocked |
| BUG-012 | could-not-test (console down); code verified | useLowStock enabled only for TENANT users |
| BUG-013 | SF-025 PASS; registry says not a bug | not re-investigated |

New findings: none Critical/High. Tenant isolation (TEN-001..014, 14/14) PASS; no cross-tenant exposure. See final QA message for observations (API/Next dev servers dying under memory pressure, ~155 MB free during the run).
