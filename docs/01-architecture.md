# 01 — System Architecture

**Project:** EMS — Multi-Tenant E-Commerce Management SaaS
**Status:** Design baseline (locked decisions marked 🔒)
**Audience:** Engineering, DevOps, QA

---

## 1. Locked architectural decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| AD-1 🔒 | Tenant isolation | **Shared schema + `tenant_id` discriminator** | One DB, one migration run, one pool. Scales to thousands of SMB tenants. Cross-tenant marketplace/commission reporting stays a plain SQL join instead of an N-database fan-out. |
| AD-2 🔒 | Primary RDBMS | **MySQL 8.4 (InnoDB, utf8mb4_0900_ai_ci)** | Per build spec. Compensating controls for its gaps are listed in §4.4. |
| AD-3 | Log/analytics store | MongoDB 7 with TTL indexes | Write-heavy, schemaless, disposable. Never on the request's critical path. |
| AD-4 | Cache / ephemeral state | Redis 7 (Cluster-ready keyspace) | Sessions, JWT denylist, OTP, cart, cache-aside, rate limits, BullMQ. |
| AD-5 | Repo topology | pnpm workspaces + Turborepo monorepo | Shared Zod contracts between API and web with zero publish step. |
| AD-6 | Backend shape | **Modular monolith, microservice-extractable** | Each module owns its schema slice and talks to peers only via ports + domain events, so any module can be lifted out later without a rewrite. |
| AD-7 | Event delivery | **Transactional outbox → relay → BullMQ** | An in-process `EventEmitter` loses events when a commit fails or a pod dies. Money-touching flows cannot tolerate that. |
| AD-8 | CQRS scope | **Selective** — Order, Payment, Inventory, Subscription, Commission | Full CQRS on CRUD modules (Brand, CMS Page) is ceremony without payoff. |
| AD-9 | Cache invalidation | **Version-counter namespacing** | Bump one integer to invalidate a whole tenant namespace. No `KEYS`/`SCAN` in production. |
| AD-10 | Password hashing | bcrypt cost 12 (spec) with prefix-tagged hash column | Column stores `$2b$…` today; `$argon2id$…` accepted so we can migrate on next login without a downtime window. |

---

## 2. Context view — who talks to the platform

```
                     ┌──────────────────────────────────────────┐
                     │            EMS SaaS Platform             │
   Platform Admin ──►│                                          │
   (super admin)     │  Console API · Storefront API · Workers   │
                     │                                          │
   Merchant       ──►│                                          │◄── Payment gateways
   (store admin,     │                                          │    Razorpay · Stripe · PayPal
    staff)           │                                          │    Cashfree · PhonePe
                     │                                          │
   Shopper        ──►│                                          │◄── Logistics
   (tenant's         │                                          │    Delhivery · Shiprocket
    customer)        │                                          │    Blue Dart · DTDC · XpressBees
                     │                                          │
   Reseller /     ──►│                                          │◄── Channels
   Supplier          │                                          │    Amazon · Flipkart · eBay
   (marketplace)     │                                          │    Meta Shops · WhatsApp Business
                     └──────────────────────────────────────────┘
                          │           │            │        │
                       MySQL       MongoDB      Redis     S3 / CDN
                    (system of    (logs +     (cache,   (media, invoices,
                      record)     analytics)   queues)     exports)
                                                            │
                                              Email/SMS/WhatsApp · DNS+ACME
```

**Three distinct HTTP surfaces, one deployable API:**

| Surface | Consumer | Tenant resolved by | Auth |
|---|---|---|---|
| `/api/v1/platform/*` | Super admin console | none (cross-tenant by design) | Platform JWT + `platform:*` permissions |
| `/api/v1/console/*` | Merchant dashboard | `tid` claim inside JWT | Tenant-user JWT + RBAC |
| `/api/v1/storefront/*` | Shopper (public store) | `Host` header → domain lookup | Anonymous or customer JWT |
| `/api/v1/webhooks/*` | Gateways, carriers, channels | route param + HMAC signature | Signature verification only |

Keeping these as separate route trees means an authorization mistake in one cannot widen the blast radius of another — the guards differ per tree, not per endpoint.

---

## 3. Container view

```
┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  apps/console   │  │ apps/storefront │  │   apps/api       │
│  Next.js 15     │  │  Next.js 15     │  │   NestJS 11      │
│  (admin +       │  │  multi-tenant   │  │                  │
│   merchant)     │  │  by Host hdr    │  │  ┌────────────┐  │
│  CSR-heavy      │  │  ISR + tags     │  │  │ 20 modules │  │
└────────┬────────┘  └────────┬────────┘  │  └────────────┘  │
         │                    │           └───┬──────────────┘
         └────────┬───────────┘               │
                  ▼                           │
          ┌───────────────┐                   │
          │  Nginx / ALB  │───────────────────┘
          │ TLS · routing │
          └───────────────┘
                  │
   ┌──────────────┼───────────────┬───────────────┐
   ▼              ▼               ▼               ▼
apps/worker   MySQL 8.4      Redis 7        MongoDB 7
BullMQ        primary +      cache ·        logs (TTL)
processors    read replica   queues
```

`apps/api` and `apps/worker` are **the same NestJS codebase started with different bootstraps** (`main.ts` vs `worker.ts`). Identical DI graph, different entrypoint: the API registers controllers, the worker registers BullMQ processors. This keeps domain logic in exactly one place while letting the two scale independently — order-import spikes should not slow down checkout.

---

## 4. Multi-tenancy — the core mechanism

### 4.1 Tenant resolution pipeline

Resolution happens once, in middleware, before any guard or controller:

```
Request
  │
  ├─ 1. Correlation ID       ── generate/propagate X-Correlation-Id
  │
  ├─ 2. TenantResolver       ── strategy chosen by route tree:
  │        storefront ─► Host header ─► domains table (Redis-cached)
  │        console    ─► verified JWT `tid` claim
  │        platform   ─► no tenant  (or explicit impersonation, audited)
  │        webhook    ─► route param, validated against HMAC payload
  │
  ├─ 3. TenantContext        ── AsyncLocalStorage store is opened here:
  │        { tenantId, storeId, userId, correlationId, plan, permissions }
  │
  ├─ 4. Guards               ── JwtAuthGuard → TenantStatusGuard → PermissionsGuard
  │                             → PlanQuotaGuard → ThrottleGuard
  │
  ├─ 5. ValidationPipe       ── Zod schema from packages/contracts
  │
  ├─ 6. Controller → Command/Query handler → Domain → Repository
  │
  └─ 7. Interceptors (exit)  ── ResponseEnvelope → Cache → AsyncMongoLogger
```

`TenantContext` is read via `AsyncLocalStorage`, **never** passed as a parameter through the call stack and **never** stored on a request-scoped provider. Request-scoped providers would force the entire dependency subtree to become request-scoped, which destroys throughput; ALS gives us implicit context at singleton speed and works unchanged inside BullMQ processors (the job payload carries the context and the processor re-opens the store).

### 4.2 Enforcement — three independent layers

MySQL has no row-level security, so isolation is a code invariant. One layer is not enough; a single forgotten `where` clause is a cross-tenant data breach. We use three:

**Layer 1 — `TenantScopedRepository`.** All tenant-owned data access goes through a base repository whose every read/write path injects `tenant_id = :ctxTenantId`. Raw `EntityManager` injection is banned by lint rule outside `infrastructure/`.

**Layer 2 — TypeORM `EntitySubscriber` (`TenantGuardSubscriber`).**
- `beforeInsert` — stamps `tenant_id` from context; throws `TenantContextMissingError` if absent.
- `beforeUpdate` / `beforeRemove` — throws `CrossTenantAccessError` if the loaded entity's `tenant_id` ≠ context.
- `afterLoad` — same assertion, catching any query that escaped Layer 1.

**Layer 3 — CI enforcement.**
- A reflection test asserts every entity in `entities/` either carries `@TenantScoped()` or is on an explicit `PLATFORM_GLOBAL_ENTITIES` allowlist. New tables cannot silently skip scoping.
- A **tenant-leakage suite** seeds two tenants with identical-looking data and replays every `console`/`storefront` endpoint with tenant A's token against tenant B's resource IDs, asserting `404` (not `403` — a `403` confirms the row exists, which is itself a leak).

### 4.3 Schema conventions for tenant-owned tables

```sql
tenant_id  BIGINT UNSIGNED NOT NULL,          -- always column 2, right after id
...
PRIMARY KEY (id),
UNIQUE KEY uq_<table>_tenant_<field> (tenant_id, <field>),   -- never UNIQUE(field) alone
KEY idx_<table>_tenant_created (tenant_id, created_at),      -- tenant_id leads every index
CONSTRAINT fk_<table>_tenant FOREIGN KEY (tenant_id)
  REFERENCES tenants (id) ON DELETE RESTRICT
```

Two rules that are easy to get wrong and expensive to fix later:

1. **`tenant_id` is the leading column of every composite index.** Queries are always tenant-filtered, so an index that does not start with `tenant_id` cannot be used for the filter and MySQL falls back to a scan.
2. **Every business-unique field is unique *per tenant*, never globally.** Two different stores must both be allowed to sell SKU `SHIRT-001` and to number their first order `#1001`.

### 4.4 Accepted MySQL trade-offs and their compensating controls

| MySQL gap | Compensating control |
|---|---|
| No row-level security | Three enforcement layers (§4.2) + leakage suite in CI |
| No partial indexes (`WHERE deleted_at IS NULL`) | Generated stored column `is_active TINYINT` included in hot indexes |
| Weak JSON indexing | Multi-valued indexes on `JSON` where supported; searchable product attributes additionally normalized into `product_attribute_values` |
| Full-text search is limited | MySQL `FULLTEXT` for MVP; OpenSearch adapter behind `SearchPort` from Phase 6 |

---

## 5. Backend layering (DDD, applied honestly)

Not every module deserves an aggregate root. Forcing full DDD onto `Brand` produces four files that do what one repository call would. We tier modules by invariant complexity:

### Tier A — Rich domain model + CQRS
`Order`, `Payment`, `Inventory`, `Subscription`, `Commission/Settlement`

These have real invariants that must never be violated: an order's total must equal the sum of its lines plus tax minus discount; stock cannot go negative; a settlement must balance. They get a pure domain layer with no framework imports.

```
modules/order/
├── domain/
│   ├── order.aggregate.ts          # invariants live here; zero framework imports
│   ├── order-line.entity.ts
│   ├── value-objects/              # Money, OrderNumber, Quantity, TaxRate
│   ├── events/                     # OrderPlaced, OrderCancelled, OrderRefunded
│   └── ports/                      # OrderRepositoryPort, PaymentGatewayPort
├── application/
│   ├── commands/                   # PlaceOrder, CancelOrder, RefundOrder
│   ├── queries/                    # ListOrders, GetOrderDetail
│   ├── sagas/                      # OrderFulfilmentSaga
│   └── dto/
├── infrastructure/
│   ├── persistence/                # TypeORM entity, mapper, repository impl
│   └── gateways/                   # Razorpay/Stripe adapters
└── interface/
    ├── order.controller.ts         # console
    ├── order-storefront.controller.ts
    └── order.presenter.ts
```

**Critical rule:** `domain/` may import nothing but other `domain/` files and `packages/kernel`. Enforced by an ESLint `no-restricted-imports` boundary rule, not by convention.

### Tier B — Service + repository, no aggregate
`Product`, `Customer`, `Coupon`, `Shipping`, `Theme`, `Notification`

Transaction-script services with DTO validation. Promotable to Tier A if invariants grow.

### Tier C — Thin CRUD
`Brand`, `Category`, `CMS Page`, `Blog`, `Warehouse`

Generic `CrudService<T>` base with hooks. ~40 lines per module.

**Money is never a `number`.** All amounts are `BIGINT` minor units (paise/cents) in the DB and a `Money { amountMinor: bigint, currency: Currency }` value object in code. Floating-point arithmetic on currency is a defect, not a style preference.

---

## 6. Event architecture — transactional outbox

An `EventEmitter2` call inside a transaction fires even if the transaction later rolls back, and vanishes entirely if the pod dies between commit and emit. For "order placed → decrement stock → charge card → notify → route to supplier", both failure modes corrupt state.

```
┌── Single MySQL transaction ────────────────────┐
│  INSERT INTO orders …                          │
│  INSERT INTO order_items …                     │
│  UPDATE inventory_levels …                     │
│  INSERT INTO outbox_events (…, status='PENDING')│  ← event is part of the commit
└────────────────────────────────────────────────┘
                     │ commit
                     ▼
        OutboxRelay (worker, 500 ms poll,
        SELECT … FOR UPDATE SKIP LOCKED)
                     │
                     ▼
              BullMQ topic queues
                     │
   ┌────────┬────────┼────────┬─────────┐
   ▼        ▼        ▼        ▼         ▼
inventory  notif   analytics channel  commission
```

Properties this buys us:

- **Atomicity** — event and state commit together or not at all.
- **At-least-once delivery** → every consumer must be **idempotent**, keyed on `(consumer_name, event_id)` in a `processed_events` table with a unique constraint. This is a hard requirement, not a nice-to-have.
- **`SKIP LOCKED`** lets N relay replicas run concurrently with no coordination and no double-dispatch.
- **Replayability** — resetting `status` re-drives a consumer, which is how we recover from a consumer bug without asking merchants to re-place orders.

`EventEmitter2` is still used, but only for genuinely in-process, loss-tolerant concerns (cache-warming hints, dev-time hooks).

### 6.1 Queue topology

| Queue | Concurrency | Retry | Notes |
|---|---|---|---|
| `outbox-relay` | 4 | n/a | Poll loop, not job-driven |
| `order-lifecycle` | 10 | 5× exp backoff | Fulfilment saga steps |
| `payment-reconcile` | 5 | 8× exp backoff | Gateway polling for `PENDING` payments |
| `inventory-sync` | 8 | 3× | Cross-channel and shared-inventory propagation |
| `notification` | 20 | 3× | Email / SMS / WhatsApp / push fan-out |
| `channel-sync` | 4 per channel | 5× | Marketplace listing + order pull; rate-limit aware |
| `import-export` | 2 | 1× | Bulk CSV/XLSX; streamed, chunked, resumable |
| `report-generation` | 3 | 2× | Heavy aggregation → S3 |
| `provisioning` | 2 | 5× | Store creation, DNS verify, ACME issuance |
| `subscription-billing` | 4 | 6× | Renewals, dunning, grace/suspend transitions |
| `analytics-rollup` | 2 | 2× | Cron-driven MySQL → rollup tables |
| `dead-letter` | 1 | — | Terminal failures; alerts + admin replay UI |

Every job payload carries `{ tenantId, correlationId, causationId }` so a shopper's click can be traced through six async hops.

---

## 7. Caching strategy

### 7.1 Version-counter namespacing

Naive invalidation needs `SCAN`/`KEYS` over a pattern — O(keyspace), and lethal on a large Redis. Instead every cacheable namespace has a monotonic version integer; a write bumps the version, which orphans all old keys at once and lets TTL reclaim them lazily.

```
Read:
  ver = GET  t:{tid}:ver:products                  # e.g. 41
  key = t:{tid}:v41:products:list:{queryHash}
  hit → return
  miss → load → SETEX key <ttl> value

Write (any product mutation):
  INCR t:{tid}:ver:products                        # → 42; every v41 key is now unreachable
```

**Cost:** one extra `GET` per read (pipelined with the value fetch, so ~0 added round-trips).
**Benefit:** invalidation is a single `INCR` regardless of how many keys exist, and it is safe under concurrency.

### 7.2 Cache map

| Namespace | TTL | Invalidated by |
|---|---|---|
| `t:{tid}:v{n}:products:*` | 300 s | product/variant/price/stock write |
| `t:{tid}:v{n}:categories:tree` | 3600 s | category write |
| `t:{tid}:v{n}:home` | 120 s | theme, banner, or featured-product write |
| `t:{tid}:v{n}:dashboard:{range}` | 60 s | TTL only (approximate is acceptable) |
| `t:{tid}:theme:active` | 3600 s | theme publish |
| `domain:{host}` → tenant/store | 600 s | domain CRUD (explicit `DEL`) |
| `cart:{tid}:{cartId}` | 30 d | cart mutation (Redis **is** the store of record until checkout) |
| `sess:{userId}:{jti}` | = refresh TTL | logout, password change |
| `jwt:deny:{jti}` | = remaining access TTL | logout, force-revoke |
| `otp:{purpose}:{identifier}` | 300 s | consume or expire |
| `rl:{scope}:{id}:{window}` | window | sliding-window Lua script |

### 7.3 Stampede protection

Hot keys (homepage, category tree) use a short-lived `SETNX` mutex: the miss-winner rebuilds while others serve the stale value for up to 2 s. Prevents a cache expiry from turning into a thundering herd against MySQL — the classic failure mode of a flash sale.

---

## 8. Security architecture

### 8.1 Token model

| Token | Lifetime | Alg | Storage |
|---|---|---|---|
| Access | 10 min | RS256 | Client memory only — never `localStorage` |
| Refresh | 30 d | RS256 | `httpOnly` + `Secure` + `SameSite=Strict` cookie; **SHA-256 hash** in MySQL |
| Storefront customer | 24 h | RS256 | `httpOnly` cookie, tenant-bound |

**RS256, not HS256** — the storefront and worker processes verify tokens but must never hold signing power. Keys rotate via a JWKS endpoint with `kid`, so rotation needs no coordinated restart.

**Refresh rotation with reuse detection.** Each refresh issues a new token in the same *family* and revokes its predecessor. Presenting an already-used refresh token means it was stolen → the **entire family** is revoked and the user is force-logged-out everywhere. Without this, a stolen refresh token is a permanent backdoor.

Access-token claims: `sub`, `tid`, `sid` (store), `roles`, `perms` (bitmask-compressed), `plan`, `jti`, `typ`. Every request checks `jwt:deny:{jti}` — one Redis `EXISTS`, which is what makes stateless JWTs revocable.

### 8.2 Authorization — RBAC + permissions

Three-layer check, in order:

1. **`TenantStatusGuard`** — is the tenant `ACTIVE`? (Suspended/past-due tenants get read-only or `402`.)
2. **`PermissionsGuard`** — does the user hold `product:update` etc.? Permissions are `resource:action` strings resolved role → permission, cached per user in Redis with a version counter.
3. **`ResourceOwnershipGuard`** — does the target row belong to the caller's tenant *and* store? (Multi-store tenants exist.)

`@Public()`, `@Permissions('order:refund')`, and `@PlatformOnly()` decorators make intent explicit at the handler. **Default is deny**: a controller with no decorator is treated as authenticated-and-permissionless, and a CI test enumerates every route to assert none is unintentionally `@Public()`.

### 8.3 Per-concern controls

| Concern | Control |
|---|---|
| Transport | TLS 1.3 only; HSTS `max-age=31536000; includeSubDomains; preload` |
| Headers | Helmet; CSP per surface (storefront allows tenant CDN assets, console does not) |
| CORS | Dynamic allowlist from `tenant_domains` — **not** `origin: true` |
| SQL injection | Parameterized queries only; raw SQL confined to `infrastructure/` and code-reviewed |
| XSS | React auto-escaping; merchant-authored CMS HTML sanitized server-side with DOMPurify allowlist before persistence |
| CSRF | Cookie auth on storefront mutations → double-submit token; `Bearer` console APIs are exempt by design |
| Rate limiting | Redis sliding window: per-IP on auth (5/min), per-tenant by plan tier, per-endpoint on expensive reports |
| Uploads | Magic-byte type sniffing (not extension), size cap, EXIF strip, S3 presigned PUT direct-to-bucket, ClamAV scan on `provisioning` queue |
| Webhooks (in) | HMAC signature + timestamp window + `event_id` replay table |
| Webhooks (out) | Merchant-supplied secret, HMAC-signed, SSRF-guarded (deny RFC1918/link-local/metadata IPs) |
| PII | AES-256-GCM app-level encryption on customer phone/email hash columns; card data **never** touches our DB (gateway tokens only) |
| Secrets | Zod-validated `ConfigService` at boot — fail fast, never fall back to a default in prod. AWS Secrets Manager / sealed-secrets at runtime. |
| Audit | Append-only `audit_logs` in MySQL for every privileged mutation (actor, before, after, IP, correlation ID) |

### 8.4 PCI-DSS posture

The platform is **SAQ-A** by construction: card entry happens in gateway-hosted fields/iframes; we persist only gateway tokens, last-4, brand, and expiry. Any design change that would put a PAN in our process is a compliance-scope change and requires explicit sign-off.

---

## 9. Observability

**Correlation.** `X-Correlation-Id` is generated at the edge, carried in ALS, stamped onto every log line, Mongo document, outbox event, and BullMQ job. One ID reconstructs a checkout across API → worker → gateway → webhook.

**Async request logging.** The Mongo logging interceptor **never** blocks the response:

```
Response sent to client
        │
        └─► setImmediate() ─► in-memory ring buffer (bounded, 10k)
                                    │
                    batch flush every 1 s / 500 docs
                                    │
                                    ▼
                    MongoDB (unordered bulkWrite, w:0)
```

Backpressure policy: if the buffer fills, **drop logs and increment a counter** — never grow unbounded and never slow the API. Bodies are redacted (`password`, `token`, `card*`, `cvv`, `authorization`) and truncated at 8 KB. Sampling: 100 % of errors and mutations, 10 % of `2xx` GETs — full-fidelity GET logging on a busy storefront is pure cost.

**Metrics** (`/metrics`, Prometheus): RED per route, queue depth/latency/failure per queue, gateway call latency by provider, cache hit ratio by namespace, tenant-scoped request rate, outbox lag (the single most important health signal — rising lag means async state is drifting from committed state).

**Tracing**: OpenTelemetry auto-instrumentation for HTTP/MySQL/Redis/Mongo, with manual spans across BullMQ boundaries.

**Health**: `/health/live` (event loop responsive — never touches dependencies, or a Redis blip restarts every pod), `/health/ready` (MySQL + Redis reachable), `/health/startup` (migrations applied).

---

## 10. Provisioning flow (store creation)

The most failure-prone path in the product, because it spans DNS, ACME, and payment — all external and all slow. Modelled as an idempotent, resumable saga; each step records its own status so a retry resumes rather than restarts.

```
Payment confirmed
  → tenant row (status=PROVISIONING)
  → store row + default settings (currency, tax, locale)
  → subdomain {slug}.ems.app → DNS upsert
  → theme clone (template → tenant-owned theme config)
  → seed catalog (sample category/product, deletable)
  → object-storage prefix + CDN behaviour
  → ACME cert issuance (DNS-01)                     ← slowest, retried
  → search index namespace
  → welcome notification
  → tenant status = ACTIVE
```

Custom domains follow a separate flow: merchant adds domain → we issue a `TXT` challenge → `provisioning` queue verifies with exponential backoff up to 72 h → on success, ACME issue + CDN alias, then activate. **Partial failure must be visible**: the merchant's dashboard shows per-step status, because "your store is being created" with no detail is the single largest support-ticket generator in this product category.

---

## 11. Multi-channel & marketplace architecture

Two distinct capabilities that are easy to conflate:

**(a) External channel sync** — push our catalog to Amazon/Flipkart/eBay/Meta and pull their orders back. Every channel implements one port:

```ts
interface ChannelAdapterPort {
  publishListing(product: ProductSnapshot): Promise<ChannelListingRef>
  syncInventory(updates: InventoryDelta[]): Promise<SyncResult>
  pullOrders(since: Date, cursor?: string): Promise<ChannelOrder[]>
  acknowledgeOrder(ref: ChannelOrderRef): Promise<void>
  mapStatus(external: string): OrderStatus
}
```

Per-channel rate limits, cursors, and field mappings live in the adapter. **Inventory is authoritative in EMS**; channels are eventually-consistent replicas. Oversell risk is managed with a per-channel buffer (reserve N units) — with independent sales channels, oversell cannot be eliminated, only bounded, and pretending otherwise leads to angry customers.

**(b) Internal product sharing (supplier ↔ reseller)** — merchant A lists merchant B's product.

```
product_shares (supplier_tenant_id, reseller_tenant_id, product_id,
                commission_type, commission_value, status)
```

A shopper buys from the reseller's storefront → order splits into per-supplier sub-orders → each routes to its supplier's fulfilment → `commission_ledger` records reseller margin and platform fee → `settlements` batch by period and produce a payout.

Two hard requirements: the **`commission_ledger` is append-only, double-entry** (a corrected commission is a reversing entry, never an `UPDATE` — mutable money records are unauditable), and **shared inventory is reserved against the supplier's stock at order placement**, not at fulfilment.

---

## 12. Storefront rendering

Multi-tenant Next.js resolving tenant from the `Host` header in middleware:

```
GET https://myshop.com/products/blue-shirt
  → middleware: Host → domain lookup (cached) → rewrite to
    /_tenant/{tenantId}/products/blue-shirt, inject x-tenant-id
  → RSC fetches storefront API with tenant header
  → render with tenant theme tokens (CSS custom properties)
  → ISR cache tagged: tenant:{id}, product:{id}, theme:{id}
```

Theme customization (colors/fonts) compiles to **CSS custom properties**, not per-tenant Tailwind builds — a build per tenant does not scale past a few hundred stores. Product/price writes call `revalidateTag()`, so a price change is live in seconds without a deploy and without abandoning static rendering for everything.

---

## 13. What we are deliberately deferring

Honest scope boundaries, so these do not surface as surprises:

| Deferred | Why | Revisit |
|---|---|---|
| Extracting microservices | Modular monolith with ports is faster to build and deploy; extraction is mechanical once boundaries are proven | At sustained scale pain |
| OpenSearch | MySQL `FULLTEXT` is adequate below ~50k SKUs/tenant | Phase 6 (`SearchPort` exists from day 1) |
| Kafka | BullMQ + outbox covers our ordering and volume needs | If cross-service streaming becomes real |
| Mobile apps | API-first design makes this additive | Post-GA |
| AI features | Behind ports so they are additive, not architectural | Post-GA |

---

## 14. Non-functional targets

| Metric | Target |
|---|---|
| Storefront TTFB (cached) | < 200 ms p95 |
| Console API read | < 300 ms p95 |
| Checkout (order placement) | < 800 ms p95 |
| Outbox relay lag | < 2 s p99 |
| Uptime | 99.9 % monthly |
| RPO / RTO | 5 min / 1 h |
| Tenants per shared DB | 5,000 (then shard by tenant range) |

---

**Next:** [02 — Data Model](./02-data-model.md) · [03 — Folder Structure](./03-folder-structure.md) · [04 — API Conventions](./04-api-conventions.md) · [05 — Roadmap](./05-roadmap.md)
