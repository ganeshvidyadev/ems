# EMS QA — Test Plan

## 1. Verified project understanding

Sources inspected: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `PROJECT_RUN_GUIDE.md`, `PROJECT-JANKARI.md`, `PROJECT_COMPLETE_FLOW.md`, `PRODUCTION_READINESS_REPORT.md`, `docs/` (incl. `docs/qa/`), all controllers/entities/migrations/seeds, `packages/contracts`, existing jest configs and specs, live Swagger JSON (344 operations documented), and live behaviour of the running stack. Docs conflict with each other (JANKARI is optimistic and stale; the production-readiness report grades the system **D — not production ready**); code and observed behaviour were treated as the source of truth.

| Fact | Verified value |
|---|---|
| Monorepo | pnpm 9 + Turborepo; apps `api` `console` `storefront` `marketing`; packages `contracts` `kernel` `config-typescript` |
| API | NestJS, 355 HTTP routes (console 195, platform 74, storefront 54, auth 20, webhooks 3, other 9), ~63 `@Public()` |
| Data | TypeORM + MySQL 8.4 (76 entities, 19 migrations), MongoDB logs, Redis cache (cloud), BullMQ Redis :6380 |
| Auth | JWT RS256, `userType` PLATFORM/TENANT, `tid` tenant claim, RBAC permission codes (212 permissions, 12 roles) |
| Isolation | 3 layers: tenant-scoped repository predicate, TypeORM subscriber, CI coverage test; cross-tenant => 404 |
| Storefront tenancy | tenant from `Host`/`x-ems-hostname` (`*.ems.localhost`) |
| Existing tests | api jest unit (25 suites/206 tests), kernel Money (33); integration tier empty; isolation + e2e tiers need `ems_test` + Redis :6380; no frontend/browser tests; no Playwright |
| Implemented (exercised) | auth, RBAC, tenancy, website module, catalog, inventory, cart/checkout (COD), orders, coupons, marketing/console/storefront UIs |
| Partial / stub | loyalty (ledger only), gift cards (no adjust/void), channels (eBay + stub), notifications (email real, rest stubbed), shipping (stub carrier), marketplace |
| Not wired | recurring billing/renewal, 5 queues without processors, API-key auth, rate limiting |
| Infra blockers | **BullMQ Redis 127.0.0.1:6380 unavailable**, no SMTP, no MinIO/S3, no Docker |

## 2. Agent configuration

`.claude/agents/ems-qa-engineer.md` — read/terminal/browser tools only (no product-code edits by rule), `model: inherit`. It encodes the discovery procedure, hard safety rules (no deletes, no commits, no real payments, no credential printing), status vocabulary, bug and report formats, and the known-issue watch list. It runs the suite in `qa/`.

## 3. Testing architecture

```
qa/ (standalone package: node:test + playwright-core + system Chrome; no browser download, no extra framework)
  lib/config|client|db|browser.mjs     API client (token cache), read-mostly MySQL helper, Playwright launcher/recorder
  api/00..08  environment, auth, rbac, tenant-isolation, website-module, storefront-workflow,
              merchant-to-order-workflow, security-contract, db-integrity
  e2e/01..03  marketing, console, storefront (desktop/tablet/mobile, screenshots, console/network error capture)
  run-all.mjs            sequential runner + 1 automatic retry per failing file -> qa-reports/results.json (+raw/)
  generate-results.mjs   TEST_RESULTS.md      generate-bugreport.mjs   BUG_REPORT.md (from bug-registry.json)
```
Design choices: reuse the existing jest unit tier unchanged; add black-box API tests with Node's built-in runner (zero dependencies) because the repo has no integration tier; add Playwright (core only) for browser E2E; fixtures are QA-tagged and removed in `after()` hooks; assertions are deterministic (ids, counts, DB rows).

## 4. Risk-based execution plan (order actually run)

1. Environment gate (health, MySQL, Mongo, BullMQ, frontends, Swagger, metrics).
2. Existing unit tests, typecheck, lint.
3. Auth -> RBAC -> **tenant isolation** (highest risk) -> Website module -> storefront/checkout -> merchant-to-order workflow -> API contract/security -> DB integrity.
4. Browser E2E: marketing (6 routes x 3 viewports, links, SEO, dynamic reflection incl. 60 s ISR window, XSS), console (super-admin + merchant, 39 routes, Website module UI), storefront.
5. Re-run every failing file once; classify FLAKY vs confirmed; write reports.

## 5. Required dependencies

Node >= 20 (24 in use), Google Chrome (path via `QA_CHROME`), `playwright-core` (installed under `qa/`), MySQL client binary (`QA_MYSQL_BIN`), the local stack running (API 4000, console 3000, storefront 3001, marketing 3003, MySQL 3307, Mongo 27017). Optional/blocked: BullMQ Redis 6380, SMTP, MinIO, payment/shipping sandbox credentials.

## 6. Expected coverage

Covered: auth, RBAC, isolation, website module, catalogue/inventory/cart/checkout(COD)/orders, coupons, UIs, API contract, DB invariants, key security checks. Deliberately **not** covered (BLOCKED/NOT_TESTED, listed in MODULE_COVERAGE.md): signup/provisioning, queues, email, uploads, real gateways, shipping/returns/refund flows, domains/SSL, marketplace/channels, load/performance.

## 7. How to re-run after every change

```bash
cd qa && npm install --no-package-lock
node run-all.mjs all --retry-failed      # everything (~25 min; Next dev compiles pages on first hit)
node run-all.mjs api                      # API only (~6 min)
node --test api/03-tenant-isolation.test.mjs   # one suite
node generate-results.mjs && node generate-bugreport.mjs   # refresh reports
```
