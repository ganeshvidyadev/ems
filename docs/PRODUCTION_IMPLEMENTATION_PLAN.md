# Production audit and implementation plan

Audit started: 2026-09-14. Baseline: existing NestJS/TypeORM API, Next.js merchant console and storefront, pnpm/Turbo monorepo. No application changes preceded this inventory. This is a source audit and historical QA review, not certification of every route or a live infrastructure audit. Expand findings as each phase is exercised.

## Architecture and existing capability

- MySQL 8.4 is the transactional database; MongoDB stores logs/analytics. Redis cache and BullMQ queue Redis are separate. S3 storage, separate worker entry point, transactional outbox, Kubernetes and Terraform configuration already exist.
- Existing API modules: analytics, auth, banner, brand, cart, category, channel, checkout, CMS, coupon, customer, domain, gift-card, health, inventory, job, logging, loyalty, marketplace, media, menu, notification, order, order-payment, payment, platform-ops, product, provisioning, report, review, SEO, shipping, store, subscription, support, tax, tenant-export, theme, user.
- Core catalog, inventory, coupon, customer and merchant order screens exist. Historical QA exercised COD checkout, cancellation/restocking, fulfilment, reviews and coupons. Historical results are not fresh regression results.
- Shopper frontend has home, catalog, product detail, cart, checkout and confirmation. Customer authentication/account, order history, addresses, wishlist and returns screens are missing. Most backend administrative verticals lack console screens.
- Subscription plans, numeric plan limits, invoices, gateway ports and partial lifecycle services exist. Complete platform company CRUD, configurable feature entitlements, platform/company subscription dashboards and recurring billing execution are missing or partial.
- JWT rotation, tenant repositories/subscriber, RBAC, signature helpers, log redaction, metrics, Sentry/OTel wiring and health probes exist. Presence is not proof of effective security or deployed monitoring.
- Existing documentation contains architectural intentions absent from implementation (for example quota reservations and queue consumers). Source and tests take precedence.

## Prioritized issue register

| ID | Priority | Finding and evidence | Required exit evidence |
|---|---|---|---|
| PAY-01 | P0 | Public order webhook enters tenant-scoped settlement without a tenant (`checkout.service.ts`, historical WF-004). | Signed webhook resolves persisted tenant, confirms only its order; forged tenant cannot redirect settlement. |
| PAY-02 | P0 | Webhook claims processed event before work, swallows failure and returns 200 (`order-payment-webhook.controller.ts`). | Failure retries safely; concurrent/repeated events do not duplicate stock or money. |
| PAY-03 | P0 | AUTHORIZED becomes CAPTURED; PENDING becomes FAILED; capture amount mismatch only warns; currency not validated (`order-payment.service.ts`). | Pending/authorization preserved; exact amount, currency and provider reference checked before capture. |
| PAY-04 | P0 | Settlement uses unlocked rows and only three already-confirmed statuses; terminal orders may be resurrected. | Concurrent callback/webhook and late capture after cancellation/delivery are safe. |
| PAY-05 | P0 | Provider payload parser only understands Razorpay despite multiple adapters. | Provider-specific signed fixtures and sandbox payment checks. |
| PAY-06 | P0 | Refund assumes gateway success regardless of returned status; retry can increment order refund twice. | Pending/failed refunds and duplicate/concurrent refunds reconcile exactly once. |
| PAY-07 | P0 | Reconciliation skips payments lacking payment ID; recurring worker execution absent. | Lost webhook and abandoned browser recover without manual calls. |
| INV-01 | P0 | Checkout persists only first warehouse allocation; delayed confirmation/cancellation use entire line at that warehouse. | Multi-warehouse reserve/commit/release tests and parallel oversell tests. |
| UI-01 | P0 | Historical BUG-FE-003: product stream never leaves loading state. | Browser renders real products in development and production builds on multiple tenants. |
| SUB-01 | P0 | Quota guard is preflight only; missing limit allows creation; storage query references `media_assets` rather than product media. | Transactional enforcement across API/import/worker paths; missing configuration fails closed. |
| SUB-02 | P0 | Feature flags are marketing strings, not enforced entitlements; billing lifecycle/renewal workers incomplete. | Database-configured feature gates, renewal/dunning/downgrade integration tests. |
| SUB-03 | P0 | `findByTenant` casts snake_case SQL rows to camelCase entity; subscription response uses undefined properties. | Real current subscription response and plan retrieval verified. |
| CO-01 | P0 | Company management and platform company/subscription dashboards incomplete; EXPIRED tenant status missing. | Platform-only lifecycle CRUD, profile, history, limits and tenant isolation tests. |
| SEC-01 | P0 | Historical invite privilege escalation; public routes bypass status/quota guards and need individual audit. | Every route inventoried; two-tenant RBAC/IDOR probes including files and billing. |
| DEP-01 | P0 | Compose API requests two replicas with fixed container_name; no deployed frontend services/routing. | Full stack starts with multiple API/frontends, health removal and rolling restart verified. |
| QA-01 | P0 | No integration specs; limited e2e; no fresh payment/concurrency/load/deployment verification. | Full requested regression matrix with artifacts, no unresolved P0. |
| UI-02 | P1 | Shopper navigation/account/filter/gallery/checkout design incomplete; missing global error states. | Responsive accessible shopper flows, genuine data and no dead controls. |
| FLOW-01 | P1 | Historical shipment list compares public order ID to internal FK (WF-003). | Scoped order resolution and shipment response regression. |
| FLOW-02 | P1 | COD pricing preview excludes payment gateway/fee (KF-08). | Preview equals order total across payment/shipping/coupon combinations. |
| DB-01 | P1 | Several entities use plain deleted_at columns; soft deletion semantics inconsistent. | Deletion/restore tests; tenant uniqueness/FK/index audit and migration review. |
| SEC-02 | P1 | Upload completion trusts reported size until worker; shared rate limiting and sensitive webhook payload logging require review. | Payload/MIME/size, brute-force, log redaction and multi-instance checks. |
| OPS-01 | P1 | Datastore ports inherited in production Compose; certificate and custom-domain deployment require real verification. | Private shared services, valid TLS/CDN/WAF configuration and restore rehearsal. |
| PERF-01 | P1 | No current p95/CPU/memory/DB/Redis measurements; short product searches fail historical QA. | Search regression and repeatable load results against isolated staging. |
| CLEAN-01 | P2 | Dead product-level lowStockThreshold duplicates warehouse reorder setting; duplicated order/subscription payment orchestration. | Remove/deprecate only after usage audit; share proven payment policy where appropriate. |
| ARCH-01 | P1 | Requested PostgreSQL differs from MySQL-specific migrations, locking, full-text and infrastructure. | Planned data migration with parity, rollback and load evidence; do not replace database opportunistically. |

## Phased implementation and commit gates

1. Audit: inventory source, routes, entities, UI, deployment and QA; record current test baseline. Commit audit before implementation. No claim of complete runtime coverage.
2. P0 commerce fixes: verified tenant resolution, settlement invariants, durable retries, refunds, reconciliation, inventory allocations, checkout idempotency and storefront failure. Add focused unit and database concurrency tests.
3. Shopper redesign: reusable accessible components; tenant/error boundaries, navigation/catalog/gallery, cart and step checkout, authenticated customer account. Browser verification at phone/tablet/desktop sizes.
4. Company management: additive migrations/contracts, platform-only lifecycle/profile APIs and console, status enforcement and audit history. Verify A/B isolation.
5. Subscription/billing: database entitlements, reusable SubscriptionLimitService with transaction-bound capacity checks, lifecycle scheduler, invoices/payment history and both dashboards. Test caps under concurrency and signed billing callbacks.
6. Security: route-by-route authenticated tenant/store/customer ownership, invitation permissions, uploads, secrets, rate limiting, CSRF and logging audit. Run two-tenant negative tests.
7. Infrastructure: adapt existing Docker/Kubernetes/Nginx, frontend deployment, readiness and worker separation; Redis noeviction; deployment and recovery runbooks. Use Kubernetes health removal where available; distinguish Nginx passive failure handling from active probes.
8. Performance/database: explain hot queries, tenant indexes, pagination/cache isolation, images, load scripts and measured bottleneck fixes. PostgreSQL migration is a separate compatibility track.
9. Full regression: requested happy/error commerce paths, subscriptions, isolation and responsive UI; staging load and rolling restarts. Mark blocked tests explicitly.
10. Report: update PRODUCTION_READINESS_REPORT.md with evidence, unresolved risks and checklist. A/B prohibited until all P0s are resolved and verified.

Each phase receives a focused commit after review and appropriate checks; no deployment or live billing is implied by local verification. No destructive resets of existing data.

## Baseline verification

- Fresh API unit tests: PASS, 16 suites / 138 tests (direct installed Jest, 2026-09-14).
- Fresh API TypeScript check: PASS (`tsc -p apps/api/tsconfig.spec.json`).
- Root Turbo test/typecheck commands: BLOCKED because pnpm executable is absent from PATH; installed tools can be run directly.
- Docker and k6 executables were not found. Runtime infrastructure, browser, gateway sandbox, load and restoration checks remain NOT TESTED.
- Working tree was clean at start. No applicable AGENTS.md was found in checked ancestor/project paths.
