# 05 — Development Roadmap

---

## 0. Scope reality check

Read this before planning against the phases below.

The full brief — multi-tenant SaaS, website builder, 5 payment gateways, 5 carriers, 7 sales channels, an internal supplier/reseller marketplace with commission settlement, managed hosting with DNS + ACME automation, and a platform admin console — is a **multi-team, multi-quarter product**, not a single build. For calibration: Shopify's equivalent surface took years and hundreds of engineers.

That is not a reason to narrow the deliverable. It *is* a reason to sequence it so that something real and shippable exists early and every later phase lands on a working system rather than a half-built one.

The ordering principle: **each phase ends with something demonstrable and deployable.** No phase exists purely to prepare for the next one, because preparatory phases are where projects quietly lose months without visible progress.

Effort figures assume a team of 4–6 engineers (2 backend, 2 frontend, 1 DevOps, 1 QA). Adjust proportionally, and treat them as sequencing weights rather than commitments.

---

## Phase 1 — Foundation & tenancy core
**~3 weeks** · Blocks everything

The tenancy mechanism is built **first and completely**, because retrofitting isolation into an existing schema means touching every query, every index, and every test — and missing one is a data breach.

**Deliver**
- Monorepo: pnpm + Turborepo, three apps, `contracts`/`kernel`/`ui` packages, shared ESLint/TS/Tailwind configs
- Docker Compose: MySQL 8.4, Redis 7, MongoDB 7, MailHog, MinIO
- NestJS skeleton: Zod-validated config, TypeORM (`synchronize: false`), Redis, Mongoose, BullMQ
- `AsyncLocalStorage` request context + `TenantContextService`
- `TenantResolverMiddleware` — all four strategies
- `TenantScopedRepository` + `TenantGuardSubscriber` + the entity-coverage CI test
- Global exception filter, response envelope, Zod validation pipe, correlation-ID middleware
- Async Mongo logging interceptor (buffered, sampled, redacted, non-blocking)
- Migrations for `tenants`, `tenant_domains`, `users`, `roles`, `permissions`, `outbox_events`, `audit_logs`
- Transactional outbox + relay processor with `SKIP LOCKED`
- Health endpoints, Prometheus `/metrics`, Swagger scaffold
- Testcontainers harness; **the tenant-isolation suite exists and is wired as a blocking CI gate from day one**

**Exit criteria**
- `docker compose up` gives a working stack from a clean clone
- Two seeded tenants; every cross-tenant access attempt returns 404 in the isolation suite
- An outbox event survives a forced pod kill between commit and dispatch
- CI green: lint, typecheck, unit, integration, isolation

> The isolation suite ships in Phase 1 with a handful of routes, then grows with every new endpoint. Writing it later means auditing 300 endpoints at once — which never happens.

---

## Phase 2 — Auth, RBAC, users
**~2.5 weeks**

**Deliver**
- Registration, email verification, login, logout, logout-all
- RS256 JWT with JWKS + `kid` rotation; access 10 min / refresh 30 d
- Refresh rotation with **family-level reuse detection**
- Redis JWT denylist keyed by `jti`
- Forgot/reset password; change password revokes all sessions
- OTP request/verify (hashed codes, throttled, enumeration-safe responses)
- TOTP MFA + hashed recovery codes
- Account lockout after 5 failures
- Permission registry, 12 seeded system roles, `PermissionsGuard`, `ResourceOwnershipGuard`
- Staff invite flow; per-store role scoping
- Session management UI (list + revoke devices)
- Console `(auth)` route group; Axios client with silent refresh + request queueing during refresh
- `auth_logs` → MongoDB

**Exit criteria**
- Full auth E2E suite passes, including MFA and reuse detection
- A revoked access token is rejected within one denylist round-trip
- No endpoint is reachable without an explicit `@Public()` (enumeration test enforces this)
- Login/OTP/forgot-password responses are byte-identical for existing and non-existing accounts

---

## Phase 3 — Tenant onboarding, plans, provisioning
**~3 weeks**

**Deliver**
- Plans + `plan_limits`; seeded Basic/Standard/Premium/Enterprise
- Subscription lifecycle: trial → active → past due → suspended → cancelled
- Upgrade/downgrade with prorated adjustment
- **One payment gateway end-to-end (Razorpay)** for subscription billing — proving the port with one implementation beats five half-integrations
- Invoice generation (gapless numbering) + PDF
- Renewal, dunning, and grace-period jobs on `subscription-billing`
- `PlanQuotaGuard` with `PLAN_QUOTA_EXCEEDED` carrying `{ limitKey, current, max, upgradeUrl }`
- Stores + `store_settings`; warehouses
- **Provisioning saga** (resumable, per-step status): tenant → store → subdomain DNS → theme clone → seed catalog → storage prefix → welcome mail
- Onboarding wizard with live per-step provisioning status
- Platform admin: tenant list/detail, suspend/reactivate, plan management, audited time-boxed impersonation

**Exit criteria**
- Signup → plan → payment → provisioned live store, unattended
- Killing the worker mid-provision and restarting resumes at the failed step (no duplicate DNS records, no duplicate charges)
- Exceeding a plan cap returns 402 with actionable detail
- Past-due tenant drops to read-only; paying restores writes

> Provisioning is the highest-risk path in the product: it spans DNS, ACME, and payment, all external and all slow. Building it as a resumable saga in Phase 3 avoids the "your store is being created" dead-end that dominates support volume in this product category.

---

## Phase 4 — Catalog
**~3.5 weeks**

**Deliver**
- Categories (adjacency + materialized path), brands
- Products: all 5 types, SEO fields, HSN, barcode
- Variants with option matrix + `option_signature` duplicate guard
- Media: S3 presigned direct upload, magic-byte validation, EXIF strip, thumbnail/WebP derivatives, reorder, alt text
- Normalized filterable attributes + JSON display specs
- Tax classes and rates with effective-dating
- Bulk CSV/XLSX import: streamed, chunked, resumable, **per-row error report**
- Bulk export → S3 signed URL
- Cache-aside with version-counter invalidation on all catalog reads
- `FULLTEXT` search behind `SearchPort`
- Console: product list (server-side table), product form, variant matrix editor, media manager, category tree drag-and-drop

**Exit criteria**
- 10 000-row import completes with a downloadable per-row error CSV
- Catalog list p95 < 300 ms with a warm cache; a product write invalidates in one `INCR`
- Variant matrix cannot produce duplicate option combinations
- Isolation suite extended to every catalog route

---

## Phase 5 — Inventory, customers, cart, checkout, orders
**~4.5 weeks** · The commercial core

**Deliver**
- `inventory_levels` + append-only `inventory_movements`
- Conditional-update stock decrement (no read-then-write anywhere)
- Multi-warehouse allocation by priority; transfers; stock-take; low-stock alerts
- Customers, addresses, wishlist; customer registration + OTP login
- Redis cart as source of truth; MySQL mirror for signed-in customers; guest→customer cart merge
- Tax engine (GST CGST/SGST/IGST split, inclusive/exclusive, effective-dated)
- Coupons: all four discount types, eligibility, usage limits, stacking rules
- Gift cards (hashed codes), loyalty ledger
- **Checkout**: address → shipping method → payment → place order, idempotency-keyed
- `Order` aggregate with three independent status axes; full snapshotting
- Order lifecycle: confirm, cancel (with restock), hold, fulfil (partial), close
- Invoice + packing-slip PDFs
- Returns/RMA with inspection and restock decision
- Order timeline (status history + events)
- Storefront: home, PLP, PDP, cart, checkout, account, order tracking — themed, ISR + tagged
- Console: orders list/detail, fulfilment, returns, customers

**Exit criteria**
- Concurrent-checkout load test on 1 unit of stock: exactly one order succeeds, no negative stock
- Retried checkout with the same `Idempotency-Key` returns the original order and charges once
- Refund path: refund → inventory restock → notification → ledger entries, all idempotent
- Invoice reprinted after a product rename/reprice is byte-identical
- E2E: shopper browses → adds to cart → checks out → merchant fulfils → shopper tracks

---

## Phase 6 — Payments & shipping breadth
**~3.5 weeks**

**Deliver**
- Remaining gateways behind `PaymentGatewayPort`: Stripe, PayPal, Cashfree, PhonePe (+ PayU)
- COD with COD fee and RTO handling
- Webhook handlers per gateway: signature verification, ±5 min timestamp window, event-ID dedupe, immediate 200 + enqueue
- `payment-reconcile` poller for pending/ambiguous payments — webhooks get lost, and an unreconciled payment is either a lost sale or an unfulfilled paid order
- Partial and multi-refund support
- Carriers behind `ShippingCarrierPort`: Delhivery, Shiprocket, Blue Dart, DTDC, XpressBees
- Rate calculation, serviceability check, AWB generation, labels, manifests, pickup scheduling
- Tracking sync (webhook + polling) with `event_hash` dedupe
- RTO flow
- Console: payment settings per gateway (encrypted at rest), shipping zones and rules, carrier config

**Exit criteria**
- Each gateway passes recorded-fixture tests **plus** failure-mode tests (timeout, 500, malformed body, bad signature)
- Duplicate webhook delivery is a verified no-op
- A payment stuck in `PENDING` is resolved by the reconciler without human intervention
- Serviceability check blocks checkout for unserviceable pincodes with a clear error

---

## Phase 7 — Website builder & theming
**~3.5 weeks**

**Deliver**
- 9 theme templates (fashion, electronics, grocery, furniture, jewelry, pharmacy, restaurant, handmade, general)
- Template gallery with live preview and plan gating
- Theme clone-on-select; draft vs published config so edits never leak to live shoppers
- Section-based homepage builder (drag-and-drop, reorder, per-section settings)
- Banner management with scheduling
- Header/footer/menu builder
- Color + typography customization → CSS custom properties
- Custom pages via block builder; blog
- Sanitized custom CSS / head HTML
- SEO: meta fields, canonical, robots, XML sitemap per tenant, JSON-LD (Product/Offer/Breadcrumb/Organization), GA4 + Search Console hooks
- Storefront theme rendering + `revalidateTag` on publish

**Exit criteria**
- Publishing a theme change is live in < 10 s without a deploy
- A saved draft is invisible to shoppers until published
- Lighthouse ≥ 90 (performance, SEO, a11y) on home/PLP/PDP for all 9 templates
- Custom CSS/HTML cannot execute injected script (XSS suite)

---

## Phase 8 — Domains, hosting, SSL
**~2 weeks**

**Deliver**
- Custom domain add → `TXT` challenge → verification with exponential backoff up to 72 h
- ACME DNS-01 issuance + auto-renewal cron driven by `idx_tenant_domains_ssl_expiry`
- Wildcard subdomain routing; CDN alias per custom domain
- Nginx/ALB config for wildcard + SNI per custom domain
- Domain status UI with per-step diagnostics and copy-paste DNS records
- Dynamic CORS allowlist sourced from `tenant_domains`

**Exit criteria**
- A real custom domain resolves over valid TLS end-to-end
- Renewal fires ≥30 days before expiry and alerts on failure
- Merchant-facing errors say what to fix (e.g. "TXT record not found at `_ems-challenge.myshop.com`"), not "verification failed"

---

## Phase 9 — Marketplace: sharing, commission, settlement
**~4 weeks** · Highest domain complexity

**Deliver**
- Shareable-product opt-in; browsable internal catalog
- Share request → approve/reject → active/paused/revoked lifecycle
- Commission models: percentage, fixed, margin-based; MAP floor; price-override rules
- Shared vs allocated inventory modes
- Reseller storefront listing of supplier products
- **Order splitting** into per-supplier sub-orders with automatic routing
- Double-entry append-only `commission_ledger`; reversals on refund
- Settlement batching by period, approval workflow, payout, PDF/CSV report
- Supplier dashboard (incoming orders, shared catalog, earnings)
- Reseller dashboard (sourced products, margins, payouts)
- Platform settlement administration

**Exit criteria**
- A multi-supplier order splits correctly; each supplier sees only their own lines
- Ledger balances to zero across supplier + reseller + platform for every order, including partial refunds
- A settlement period cannot be paid twice (`uq_settlements_period`)
- A refund after settlement produces a reversal in the next period, never a mutation of the paid one

> This is where correctness matters most and is least forgiving. Every money figure a merchant disputes is reconstructed from `commission_ledger`, so it is append-only, double-entry, and reconciliation-tested from the first commit.

---

## Phase 10 — Multi-channel selling
**~4 weeks**

**Deliver**
- `ChannelAdapterPort` + OAuth connection flows
- Amazon SP-API, Flipkart, eBay, Facebook/Instagram Shops, WhatsApp Business catalog
- Listing publish with per-channel category mapping and price rules
- Inventory sync with per-channel buffer; drift detection against `synced_quantity`
- Order import (cursor-based, idempotent via `uq_orders_channel_ref`)
- Status push-back to channels
- Token refresh + expiry alerting
- Per-channel rate-limit-aware queues
- Console channel dashboards with error surfacing

**Exit criteria**
- Products publish and orders import on each connected channel
- Inventory drift is detected and reported, and buffers demonstrably bound oversell
- Re-importing the same channel order is a no-op
- An expired token raises a merchant-visible alert rather than silently failing

**Honest constraint:** each marketplace requires its own developer account, app review, and sandbox access — timelines here depend on **external approval processes we do not control**. Amazon SP-API and WhatsApp Business in particular can take weeks of review independent of engineering effort. Plan this phase with that dependency explicit, and start the account applications during Phase 8.

---

## Phase 11 — Reports, analytics, notifications, support
**~3 weeks**

**Deliver**
- `daily_sales_rollup` cron; dashboards read rollups, never scan `orders`
- Reports: sales, revenue, orders, customers (cohort/LTV), inventory, tax (GST-ready), payments, shipping, commissions
- Async report generation → S3 + signed URL; scheduled email delivery
- Notification templates (email/SMS/WhatsApp/push/in-app) with locale support
- All event-driven notifications wired: order placed, payment received, shipped, delivered, low stock, subscription renewal, settlement paid
- Provider adapters + DLT/WhatsApp template compliance
- Storefront funnel analytics from `storefront_events`
- Support tickets with SLA tracking, internal notes, satisfaction rating
- Knowledge base / FAQ CMS
- Platform log explorer (api/error/auth/webhook/job) and queue admin with replay

**Exit criteria**
- Dashboard p95 < 500 ms on a tenant with 1 M orders
- Tax report reconciles against raw order data to the paisa
- Every notification event fires exactly once per occurrence (idempotency verified)
- Failed jobs are replayable from the admin UI

---

## Phase 12 — Hardening, DevOps, launch readiness
**~3 weeks**

**Deliver**
- Multi-stage Dockerfiles (non-root, distroless where possible), Compose prod profile
- Nginx: TLS 1.3, HSTS, security headers, brotli, rate limits, wildcard + SNI
- Kubernetes: deployments, HPA, PDB, ingress, secrets, migration `initContainer` with advisory lock
- Terraform: VPC, RDS multi-AZ + replica, ElastiCache, DocumentDB, EKS, S3, CloudFront, ACM, Route53
- CI/CD: lint → typecheck → unit → integration → **isolation** → contract → build → Trivy → E2E → staging → smoke → canary prod
- Blue/green with automated rollback on error-rate regression
- Grafana dashboards + alerts: RED per route, queue depth, **outbox lag**, gateway latency, cache hit ratio, cert expiry
- Sentry; OpenTelemetry tracing across BullMQ boundaries
- Backups + **rehearsed** PITR restore; per-tenant logical export for data-portability requests
- k6 load tests; OWASP ZAP baseline; dependency + image scanning
- Runbooks: gateway outage, queue backlog, tenant data export, tenant deletion, cert renewal failure, DB failover
- Full Swagger + merchant-facing API docs

**Exit criteria**
- One-command deploy to staging and production
- Restore from backup rehearsed and timed against the 5 min RPO / 1 h RTO target
- Load test: 500 rps checkout sustained within p95 targets
- ZAP baseline clean; no critical/high CVEs in shipped images
- All 12 runbooks executed at least once by someone who did not write them

---

## Timeline summary

| Phase | Focus | Effort |
|---|---|---|
| 1 | Foundation & tenancy | 3 w |
| 2 | Auth & RBAC | 2.5 w |
| 3 | Onboarding, plans, provisioning | 3 w |
| 4 | Catalog | 3.5 w |
| 5 | Inventory → checkout → orders | 4.5 w |
| 6 | Payments & shipping breadth | 3.5 w |
| 7 | Website builder & theming | 3.5 w |
| 8 | Domains, hosting, SSL | 2 w |
| 9 | Marketplace & settlement | 4 w |
| 10 | Multi-channel | 4 w |
| 11 | Reports, notifications, support | 3 w |
| 12 | Hardening & DevOps | 3 w |
| | **Total** | **~39 weeks** |

With 4–6 engineers and partial parallelisation (frontend tracking backend by roughly half a phase, DevOps running continuously rather than only in Phase 12), **~9–10 months to GA** is the realistic figure. Phases 6/7 and 9/10 parallelise well across two teams; 1→5 is a strict chain.

### Shippable milestones

| Milestone | After | What it is |
|---|---|---|
| **Internal alpha** | Phase 5 | A merchant can sign up, get a store, load products, and take a real order |
| **Private beta** | Phase 8 | Custom domain, real gateways and carriers, a real theme — usable by design partners |
| **Public GA** | Phase 12 | Full feature set, hardened, monitored, documented |
| **Marketplace GA** | Phase 10 | Supplier/reseller network live (gated on external channel approvals) |

Phase 5 is the meaningful checkpoint: it is the first point at which the product does the thing it exists to do. Everything before it is infrastructure; everything after it is breadth.

---

## Cross-cutting practices (every phase, not a phase of their own)

1. **Tenant-isolation tests grow with every endpoint.** Non-negotiable, blocking.
2. **Migrations are expand/contract.** Never a breaking DDL in a single deploy.
3. **Every async consumer is idempotent** and tested against duplicate delivery — at-least-once makes this mandatory, not optional.
4. **Money is never a float.** `BIGINT` minor units + `Money` value object, enforced by lint.
5. **Every integration ships failure-mode tests.** Integrations break on the unhappy path.
6. **Every privileged mutation writes an audit row.**
7. **No `synchronize: true`, ever**, including local.
8. **Swagger is generated from the same Zod schemas that validate**, so docs cannot drift.
9. **Runbook before launch**, not after the first incident.

---

## Recommended first build step

Phase 1 in the order below — the tenancy mechanism precedes all feature work:

1. Monorepo + Docker Compose + config validation
2. `AsyncLocalStorage` context + `TenantResolverMiddleware`
3. `TenantScopedRepository` + `TenantGuardSubscriber` + entity-coverage test
4. `tenants` / `users` / `roles` / `permissions` / `outbox_events` migrations
5. Outbox relay with `SKIP LOCKED`
6. Global filter, envelope interceptor, Zod pipe, correlation ID
7. Async Mongo logging interceptor
8. **The tenant-isolation suite, wired as a blocking CI gate**

Say the word and I'll start building Phase 1.
