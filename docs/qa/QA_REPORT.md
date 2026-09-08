# EMS — QA Report

**Status: Phase 1 (Discovery) complete. Phase 2 (Smoke) complete. Phase 3+4 (Frontend) complete — 22 bugs found, 21 fixed and retested; BUG-FE-003 (storefront Suspense stream truncation) remains open, root-caused but not fixed. Phase 5 (API) complete — 1 new P1 found and fixed (BUG-API-001), KF-07 reconfirmed then fixed, three prior fixes (BUG-FE-018, BUG-FE-011, BUG-FE-010) and SEC-001 re-verified live at the API level. Phase 6 (Security) complete — P0 found and fixed. Phase 7 (Business workflows) complete — 5 workflows exercised end-to-end, 1 new P1 found (WF-004: non-COD payment webhooks can never confirm an order, in production too), 2 new P2s, 1 new P3, none yet fixed.**
This document is the master QA report and will be updated as each phase runs.
Nothing below is claimed as PASS unless it was actually exercised with evidence.

## Phase 2 — Smoke test results

Run against the live dev environment (`http://localhost:4000` API, `:3000` console, `:3001` storefront), all three confirmed running.

| ID | Check | Result | Evidence |
|---|---|---|---|
| SMOKE-001 | `GET /health/ready` | **PASS** | `{"status":"ok","dependencies":{"mysql":{"status":"up","latencyMs":2},"redis":{"status":"up","latencyMs":258},"mongo":{"status":"up","latencyMs":2}}}` |
| SMOKE-002 | `GET /health/startup` (migrations) | **PASS** | `{"status":"ok","migrations":"up-to-date"}` |
| SMOKE-003 | Console root responds | **PASS** | `HTTP 200` |
| SMOKE-004 | Storefront responds on a resolvable tenant host (`northwind.ems.localhost:3001`) | **PASS** | `HTTP 200` |
| SMOKE-005 | Storefront responds on a **non**-resolvable host (bare `localhost:3001`, no tenant subdomain) | **PASS (with a flag)** | `HTTP 200` with a generic "Store" fallback header, not an error page. Not itself a failure — but whether this fallback path can ever surface a *real* tenant's data needs verification, not assumption. **Handed to the Security agent (Phase 6) to test explicitly**, since it touches tenant resolution. |

**Smoke verdict: PASS.** The application starts, all three declared dependencies (MySQL/Redis/Mongo) are up, and all three apps respond. Cleared to proceed to deeper testing.

## Phase 6 — Security (tenant isolation + RBAC)

Full detail in `SECURITY_REPORT.md` and `PERMISSION_MATRIX.md`. Summary:

- **224 tenant-isolation test cases** across 8 resource types (products, orders, customers, inventory, coupons, reviews, warehouses, stores) in both directions, plus a 44-endpoint systematic sweep, plus storefront/header-forging probes. **One P0 found: SEC-001**, a cross-tenant read+write leak on Support Tickets (an entity wrongly placed on the platform-global allowlist). Everything else held — zero `403`-instead-of-`404` existence leaks anywhere.
- **SEC-001 has been fixed and retested live** (exact original exploit steps re-run against the fix, all now correctly fail). Also fixed the same root-cause defect (`z.coerce.boolean()` silently treating `"false"` as `true` on a query param) in 5 other places it existed in the codebase.
- 4 lesser findings recorded (SEC-002 blocked on missing queue Redis, SEC-003 a latent-but-currently-safe surface-detection issue, SEC-004/005 minor API inconsistencies with no leak).
- **410-cell RBAC permission matrix** across the roles with working credentials — 259 forbidden actions all correctly denied with 403, one P2 (a `STORE_ADMIN` can invite a `STORE_OWNER`, escalating past a deliberate billing restriction).
- One real data mutation happened during testing (disclosed in `SECURITY_REPORT.md` §2.3) and was reverted, with confirmation, after the fix was verified.
- The project's own dedicated `test/tenant-isolation/isolation.spec.ts` suite could not be run to completion here — its per-test tenant provisioning hangs against the missing local queue Redis, a pre-existing environment constraint, not a fix regression. Marked BLOCKED, not run.

**Phase 6 verdict: the P0 gate is now clear.** Tenant isolation holds everywhere tested, and the one break found is fixed and verified.

---

## 0. How to read this report

Per the QA charter this session was given, every test result uses exactly one of:
`PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`, `NOT TESTED`, `SKIPPED`. None of
these is ever silently converted to PASS. Where this document says "verified
this session" for something built earlier in the project's history, that means
it was exercised live in a real browser against the real API/DB at the time —
see the per-feature commit history for the exact evidence — not that it was
re-verified as part of this QA pass.

---

## 1. Architecture (confirmed by reading the repo, not assumed)

| Layer | Tech | Confirmed |
|---|---|---|
| API | NestJS 11, TypeORM, MySQL 8.4 | `apps/api` |
| Merchant Console | Next.js 15, React 19, TanStack Query, RHF+Zod | `apps/console` |
| Storefront | Next.js 15, React 19 | `apps/storefront` |
| Logs/analytics | MongoDB 7 | via `MongooseModule` |
| Cache | Redis (hosted Redis Cloud in this dev env) | `REDIS_URL` |
| Queues | Redis (BullMQ) — **separate instance, local, NOT available in this dev environment** | `REDIS_QUEUE_*` |
| Auth | JWT (RS256) + refresh rotation, MFA/TOTP, OTP | `modules/auth` |
| Payments | Razorpay/Stripe/Cashfree/PhonePe adapters + COD + `stub` | `modules/payment` |
| Infra | Docker/K8s/Terraform configs exist; **never executed in this sandbox** (no Docker available) | `infra/` |
| Monitoring | Prometheus metrics endpoint, Sentry/OTel wiring exist in code | `modules/health`, `tracing.ts` |

## 2. Inventory (counted directly from source, not estimated)

| Item | Count | Source |
|---|---|---|
| API modules | 39 | `apps/api/src/modules/*` |
| API controllers | 53 | grep count |
| API routes (`@Get/@Post/@Put/@Patch/@Delete`) | 264 | grep count |
| Permission *resources* seeded | 56 | `database/seeds/permissions.seed.ts` |
| Permission *grants* (resource×action), approx | ~161 | computed from the seed script; the README states 197 — **discrepancy not yet reconciled, flagged for Phase 1 follow-up, not resolved by assumption** |
| Roles seeded | 12 | `database/seeds/roles.seed.ts`: Platform Super Admin, Platform Support, Platform Billing, Store Owner, Store Admin, Product Manager, Order Manager, Inventory Manager, Marketing Manager, Customer Support, Supplier, Reseller |
| Console pages | 21 | `app/(app)/*` + `app/(auth)/*` — see §2.1 |
| Storefront pages | 6 | `app/*` — see §2.2 |
| Existing backend unit tests | 138 tests / 16 suites | `test/unit/*.spec.ts`, run via `jest --config test/jest-unit.json` — **currently all passing** (last run this session) |
| Existing tenant-isolation tests | 13 test cases, 1 file | `test/tenant-isolation/isolation.spec.ts` |
| Existing e2e tests | 1 spec (auth only) | `test/e2e/auth.e2e-spec.ts` |
| Integration tests | **0 spec files** — `jest-integration.json` config exists but nothing runs under it | confirmed by directory listing |

### 2.1 Console pages (21)
Auth: `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/accept-invite`.
App: `/` (Dashboard), `/system` (health check), `/products`, `/products/new`, `/products/[id]`, `/orders`, `/orders/[id]`, `/inventory`, `/inventory/[productId]`, `/coupons`, `/coupons/new`, `/coupons/[id]`, `/customers`, `/customers/new`, `/customers/[id]`, `/sessions`.

**Console verticals with NO page at all yet** (backend exists, per the API module list, but no UI): Categories, Brands, Gift Cards, Loyalty, Payments (reconciliation UI), Shipping, CMS/Blog, Themes, Analytics, Support tickets, Staff & Roles/Permissions management UI, Notifications settings, Billing/Subscription, Marketplace, Channels, Domains, Banners, Menus, SEO settings. **These are NOT IMPLEMENTED on the frontend**, not bugs — do not test them as if a UI exists.

### 2.2 Storefront pages (6)
`/` (home), `/products` (listing/search), `/products/[slug]` (detail+reviews), `/cart`, `/checkout`, `/checkout/confirmation`.

**Storefront gaps, confirmed NOT IMPLEMENTED**: no customer account/login/registration UI or API (guest-only throughout — `customerId` is always client-supplied and unauthenticated where it appears at all), no order-lookup/order-history page (no backend endpoint exists for a shopper to re-fetch an order), no category/brand navigation (no public endpoint), no wishlist UI (backend exists, console-only).

## 3. Multi-tenancy model (as designed, from `docs/01-architecture.md` + code)

Three independent layers, all confirmed present in code:
1. `TenantScopedRepository` — injects `tenant_id` into every query.
2. `TenantGuardSubscriber` — stamps `tenant_id` on insert, throws on cross-tenant load/update/delete.
3. `test/unit/tenant-coverage.spec.ts` — build fails if an entity is neither `@TenantScoped()` nor allowlisted as platform-global. **This test currently passes.**

Separately, `test/tenant-isolation/isolation.spec.ts` (13 cases) exercises actual cross-tenant access attempts at the API layer. This is real coverage, but 13 cases against 264 routes is a small fraction — Phase 6 (Security) needs to expand this, not assume it's complete.

## 4. Known findings already on record (from this project's build history, cited as evidence — not re-claimed as fresh QA results)

These were found via live testing during feature development, already fixed, and are listed here so Phase 11 (Regression) has a concrete list to re-verify rather than starting blind:

| ID | Severity (QA scale) | Area | Finding | Status |
|---|---|---|---|---|
| KF-01 | P1 | Validation | `ZodValidationPipe` validated the wrong parameter (route params, custom decorators) because it ran on every handler arg, not just the intended one | Fixed |
| KF-02 | P1 | Queues | Two BullMQ processors sharing one queue silently dropped tenant-export jobs (job.name mismatch swallowed by the other processor) | Fixed |
| KF-03 | P1 | Data integrity | `ProductEntity`/`CouponEntity`/`CustomerEntity`/`CustomerAddressEntity`/`ReviewEntity` all had `deleted_at` as a plain `@Column` instead of `@DeleteDateColumn` → every DELETE on these 500'd (`MissingDeleteDateColumnError`) | Fixed (5 of an unknown larger set — see KF-06) |
| KF-04 | P1 | Cross-module data leak | Inventory endpoints and Customer wishlist endpoints returned internal numeric FK ids where the contract promised public ULIDs (read paths "worked" only by coincidental leading-digit string→int coercion; writes 500'd outright) | Fixed |
| KF-05 | P1 | Storefront | `storefront/products` 500'd on every cache hit (cached entity's `Date` fields became strings through JSON round-trip); cart quantity-change/remove silently no-op'd for the same internal-id-vs-public-id reason as KF-04 | Fixed |
| KF-06 | P2 | Data integrity (open) | Same `deleted_at` bug as KF-03 confirmed present in **at least 6 more entities** (customer/review/brand/category/product-variant/user/tenant/store's `WarehouseEntity`) not yet fixed — a background task is queued for this but not yet executed | **Open** |
| KF-07 | P2 | Contract correctness | `ProductResponse.storeId`/`brandId`/`taxClassId` and `OrderItemResponse.productId`/`variantId` return internal ids, not public ids, the same class of bug as KF-04 | **Fixed and retested live, see `API_REPORT.md` §2.9** |
| KF-08 | P2 | Storefront pricing (open) | `checkoutPricingRequestSchema` has no `paymentGateway` field, so the live order-preview total does not include the ₹30 COD fee that the real placed order does charge — a real discrepancy between preview and final charge | **Open** |
| KF-09 | P3 | Console | Dark mode never rendered anywhere in the console app before this session (`.dark` CSS was inside `@layer base` and got purged) | Fixed |

## 5. Environment constraints — read before planning execution

Per the charter's own rule ("mark BLOCKED, never PASS"), these are the real
constraints of this sandbox, confirmed by direct testing this session:

| Constraint | Impact |
|---|---|
| **No local queue Redis** (port 6380) | BullMQ background jobs (notifications, exports, async processors) do not run. Any test depending on a queued job completing is **BLOCKED**, not a code bug. |
| **No SMTP configured** (MailHog never started) | Email verification, password reset email, order confirmation email, staff invite email — all **BLOCKED**, cannot be marked PASS or FAIL. |
| **No MinIO / object storage started** | Media upload flows are **BLOCKED**. |
| **Only `stub` payment gateway has working credentials**; COD verified working end-to-end (real order `ORD-000004` this session) | Razorpay/Stripe/Cashfree/PhonePe cannot be tested beyond unit-level signature-verification logic (`test/unit/payment-webhook-signatures.spec.ts`, which does pass) — real success/failure/webhook-retry flows against those gateways are **BLOCKED**, not tested. |
| **No Docker available in this sandbox** | Agent 29 (DevOps: Docker build/K8s manifests/CI) is **NOT EXECUTED**, full stop — the configs exist and can be read/reviewed for correctness, but nothing can actually be run. |
| **No Playwright installed**; the project has no browser E2E framework configured | Live browser verification this session used the Claude Browser tool (manual-scripted, not a saved/replayable Playwright suite) — real, but not a reusable automated regression suite. Recommend installing Playwright as a Phase-3+ prerequisite if durable, replayable E2E coverage is wanted. |
| **Single MySQL/Redis/Mongo instance, single dev machine** | No real concurrency/load testing infrastructure exists (Agent 21 Performance, Agent 10's "simultaneous buyers" scenario) — these need either a proper load-testing setup (k6 config exists at `infra/k6/checkout-load-test.js` but has never been run against a live target) or explicit scope reduction. |
| **No registered-customer storefront auth** | Every "registered customer" test case in the charter (Agent 14, parts of Agent 19) is **NOT IMPLEMENTED** on this codebase today, not blocked and not a bug — it's a real product gap already noted in `PROJECT-JANKARI.md`. |

## 6. Reconciling scope with the charter

The request specifies 32 specialized agents covering exhaustive UI-element-level
testing, full concurrency/load testing, real payment-gateway webhook fuzzing,
Docker/K8s execution, backup/restore drills, and observability triggering —
against a system with 264 API routes, 27 console pages, and 6 storefront pages.
Executed literally and exhaustively, this is a multi-week professional QA
engagement, not a single pass. Rather than fabricate coverage numbers or
silently narrow scope without saying so, here is the honest phased plan:

| Phase | Charter phase | Realistic in this environment? | Plan |
|---|---|---|---|
| 1 | Discovery | ✅ Done | This document |
| 2 | Smoke | ✅ Fully executable | Login, Console loads, API health, DB — cheap, do first |
| 3 | Frontend element inventory | ✅ Executable, scoped to what's actually built (21+6 pages, not 32 agents' worth of hypothetical ones) | Build `FRONTEND_ELEMENT_COVERAGE.md` against the real 27 pages |
| 4 | Frontend functional testing | ✅ Executable via the Browser tool, module by module | One console vertical or storefront flow at a time — this is the bulk of the work |
| 5 | API testing | ✅ **Done** — see `API_REPORT.md` | Prioritized by business criticality: ~39 routes / ~85 scenarios covering the full order lifecycle, product/coupon/customer/review/inventory CRUD+validation, cart/checkout pricing parity, and a support-ticket spot-check. Found 1 new P1 (BUG-API-001: `fulfil` had no order-status guard, so a `CANCELLED` order could still be fulfilled/shipped — **fixed and retested live**, see §4 below). Re-verified live: BUG-FE-018, BUG-FE-011, BUG-FE-010 fixes hold at the API layer; SEC-001 fix holds; KF-07 (internal ids instead of public ULIDs on `ProductResponse`/`OrderItemResponse`) confirmed still open, then **fixed and retested live** (see §4). |
| 6 | Security (tenant/RBAC/auth) | ✅ Executable, highest priority (P0 gate) | Expand the existing 13-case isolation suite; RBAC matrix against the real 12 roles |
| 7 | Business workflows | ✅ **Done** — see `WORKFLOW_REPORT.md` | 5 end-to-end workflows exercised (product onboarding, purchase→fulfilment, cancel/hold-resume/refund, customer-relationship+review moderation, coupon lifecycle) with contrasting before/after evidence throughout. Found 4 new issues: **WF-004 (P1)** — the payment-gateway webhook settlement path can never confirm a paid order for *any* non-COD gateway (a tenant-scoped repository lookup on a route that structurally has no tenant context) — every non-COD order is designed to stay stuck at `PENDING` forever, in production too, not just this sandbox; WF-002 (P2, storefront search drops queries under 4 chars); WF-003 (P2, order-shipments endpoint always empty, public/internal id mismatch); WF-001 (P3, dead UI-less inventory field). All state-machine invariants tested (inventory commit/restock/release, coupon limits/expiry, review moderation→rating) held correctly. Not yet fixed — discovery-only phase, per charter. |
| 8 | Edge cases / concurrency | ⚠️ Partial — single-process overselling test is doable manually; true concurrent-request race testing needs a small script, not just clicking | Scoped script for the "two buyers, one unit" case specifically |
| 9 | Performance | ⚠️ Partial — can measure real p50/p95 for API calls made during other testing; cannot run k6 load tests without confirming k6 is installed/runnable here | Measure incidentally first, dedicated load test only if requested |
| 10 | Infrastructure | ❌ NOT EXECUTED (no Docker) | Config review only, marked as such |
| 11 | Regression | ✅ Executable, and there's already a concrete list (§4 above) | Re-run after each fix batch |
| 12 | Release audit | ✅ Executable once the above produce real numbers | Final gate decision, evidence-based |

## 7. Recommendation

Start with **Phase 2 (Smoke)** immediately — cheap, catches "is anything actually
broken right now" before investing in deep test design — then **Phase 6
(Security: tenant isolation + RBAC)** next, since that's the P0 release gate
the charter itself prioritizes, before spending time on exhaustive UI-element
inventories that don't matter if a P0 tenant leak exists.

Deliverables will be created incrementally, per phase, as each actually runs:
`BUG_REPORT.md`, `TEST_COVERAGE.md`, `FRONTEND_ELEMENT_COVERAGE.md`,
`SECURITY_REPORT.md`, `PERMISSION_MATRIX.md`, `E2E_REPORT.md`,
`PERFORMANCE_REPORT.md`, `RELEASE_READINESS.md` — not pre-created as empty
shells, since an empty report with no evidence is worse than no report.
