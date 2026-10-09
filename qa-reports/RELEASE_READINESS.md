# EMS QA — Release Readiness

Based only on evidence from this run (see TEST_RESULTS.md for counts, BUG_REPORT.md for defects, SECURITY_FINDINGS.md, MODULE_COVERAGE.md). **Nothing here claims production readiness.**

## Verdict by environment

| Target | Verdict | Why |
|---|---|---|
| 1. Local development testing | **READY (with known issues)** | Whole stack runs; auth, isolation, website module, catalogue/inventory/checkout (merchant-created products), orders, marketing/console/storefront UIs work. Known annoyances: BUG-001 (seeded products can't be bought), BUG-003/004 (two console pages crash), BUG-006 (/metrics 500). |
| 2. Internal QA | **CONDITIONALLY READY** | Fix BUG-001 (seed) and BUG-003 (orders page) first, otherwise testers cannot follow the main demo path (browse -> buy) or open Orders reliably. Bring up BullMQ Redis :6380 (+ SMTP/MinIO) or the signup/provisioning, emails, uploads, exports and notifications cannot be tested at all. |
| 3. Staging deployment | **NOT READY** | Release blockers below (rate limiting, queue infrastructure, untested payment/shipping/returns flows, no recurring billing). Staging must run with production-like env guards (stub gateway/carrier/DNS are refused in production by design). |
| 4. Production deployment | **NOT READY — insufficient evidence** | The repo's own `PRODUCTION_READINESS_REPORT.md` grades D; this run confirms several of its open items (no rate limiting) and found new ones. Large parts were never executed (see "Missing coverage"). |

## Release blockers (must fix before staging)

1. **No rate limiting** (BUG-002, High): gift-card code enumeration and unthrottled auth/checkout endpoints.
2. **Queue infrastructure absent/unverified**: BullMQ Redis :6380 down; provisioning saga, email, exports, imports, channel sync, notifications, tenant export could not be tested (BLOCKED).
3. **Purchase path broken for seeded data** (BUG-001, High) — and no seed self-check exists to catch this class of defect.
4. **Merchant UI crashes**: Orders (BUG-003, High, ~67% of direct loads) and Subscription (BUG-004).
5. **Revenue-critical features not wired** (from code review, unverified at runtime): recurring subscription renewal/trial expiry/dunning execution, shopper-refund on cancel, loyalty/gift-card reversal, per-tenant payment accounts (SUS-004..006, SUS-009).
6. **Tenant status not enforced on storefront** (SUS-003) and **hard-coded owner password for admin-created tenants** (SUS-001) — both need verification and likely fixes.

## Security risks

High: no rate limiting. Medium: tenant-resolution dev fallback not environment-gated (BUG-005), unauthenticated `/metrics` and Swagger must be restricted/disabled in production, stale route-exposure CI gate. Low: error-message information leakage, 500 on oversized bodies. **Positive:** no cross-tenant exposure, no token forgery, no injection/XSS execution found in the exercised surface.

## Missing test coverage (carry into the next cycles)

Signup -> plan -> provisioning -> store setup; fulfilment/shipment, returns/RMA and refund flows; real or sandbox payment gateways (Razorpay/Stripe/PayPal/Cashfree/PhonePe) and webhook processing; email and notification delivery; media upload and import/export; custom domains/SSL; marketplace and channel sync; reports/analytics; platform mutations (suspend/impersonate/change plan); storefront customer register/login/returns; concurrency (overselling races, refund races); load/performance; backup/restore and rolling restart; frontend unit tests (none exist); jest integration tier (does not exist) and isolation/e2e tiers (need `ems_test` + Redis :6380).

## Infrastructure issues

BullMQ Redis :6380 unavailable; no SMTP; no MinIO/S3; no Docker on the dev host; API dev process exited silently once during the run (OBS-003); local login latency 1–7 s (OBS-004); pnpm.exe blocked by a Device Guard policy (tests were run with `node`/`npm` directly).

## Required regression tests (add to CI)

`qa/api/03` (isolation) + `qa/api/02` (RBAC) on every PR; `qa/api/06` + a new seeded-product purchase test (BUG-001); `qa/api/07` rate-limit tests once throttling lands; `qa/e2e/02` CON-010 for every console route (and lint rule `react-hooks/rules-of-hooks` as a hard gate); `qa/api/04` + `qa/e2e/01` for the Website module and marketing pages; add a seed-integrity check (every ACTIVE product purchasable).
