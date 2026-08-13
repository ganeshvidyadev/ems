# EMS — Multi-Tenant E-Commerce Management SaaS

A production-grade, multi-tenant e-commerce SaaS platform: merchants sign up, pick a plan and a template, and get a fully provisioned online store with payments, logistics, a website builder, multi-channel selling, and an internal supplier/reseller marketplace.

**Current status:** **Phase 1 complete** — monorepo, infrastructure, database schema, tenancy core, transactional outbox, async logging, and all three apps running. Authentication is Phase 2; the merchant dashboard and store provisioning are Phase 3.

---

## Design documents

Read in order — each builds on the previous.

| Doc | Contents |
|---|---|
| [01 — System Architecture](./docs/01-architecture.md) | Locked decisions, container view, multi-tenancy mechanism, DDD layering, transactional outbox, caching, security, observability, provisioning, marketplace and storefront architecture |
| [02 — Data Model](./docs/02-data-model.md) | Full MySQL 8.4 DDL (~60 tables) with index rationale, MongoDB log collections with TTL policy, Redis keyspace, growth and migration strategy |
| [03 — Folder Structure](./docs/03-folder-structure.md) | Monorepo layout, NestJS module tiers and boundary rules, both Next.js apps, shared packages, infra tree |
| [04 — API Conventions](./docs/04-api-conventions.md) | URL/versioning, response envelope, status-code semantics, pagination/filter/sort DSL, idempotency, rate limits, auth flows, endpoint surface, error registry, testing standards |
| [05 — Roadmap](./docs/05-roadmap.md) | 12 phases with exit criteria, effort estimates, shippable milestones, cross-cutting practices |

---

## Quick start

Requires Node ≥ 20.9, pnpm 9, and Docker.

```bash
corepack prepare pnpm@9.15.9 --activate
cp .env.example .env
pnpm run keys:generate      # RSA keypair + AES-256 key written into .env
pnpm install
pnpm run infra:up           # MySQL, Redis ×2, MongoDB, MailHog, MinIO
pnpm run db:migrate
pnpm run db:seed
pnpm dev                    # api :4000 · console :3000 · storefront :3001
```

### Verify it works

```bash
curl http://localhost:4000/health/ready     # all three dependencies "up"
curl http://localhost:4000/health/startup   # migrations up-to-date
curl -H "Host: northwind.ems.localhost" http://localhost:3001   # tenant A
curl -H "Host: lakeside.ems.localhost"  http://localhost:3001   # tenant B
```

Two different tenants served by one storefront process is the property everything
else in the platform depends on.

Swagger: <http://localhost:4000/api/docs> · Metrics: <http://localhost:4000/metrics> · MailHog: <http://localhost:8025>

### Seeded accounts

Password for all: `DemoPassword123!`

| Email | Role |
|---|---|
| `admin@ems.test` | `PLATFORM_SUPER_ADMIN` |
| `owner@northwind.test` | `STORE_OWNER` (tenant: northwind) |
| `ops@northwind.test` | `ORDER_MANAGER` |
| `owner@lakeside.test` | `STORE_OWNER` (tenant: lakeside) |
| `ops@lakeside.test` | `PRODUCT_MANAGER` |

Two tenants with near-identical data, deliberately: the isolation suite replays
every endpoint with tenant A's token against tenant B's resource IDs and asserts
404. A single-tenant fixture makes that test impossible to write.

---

## Ports

`.env` drives both Docker's published ports and the API's connection settings, so
changing a value there is sufficient.

| Service | Default | Note |
|---|---|---|
| API | 4000 | |
| Console | 3000 | **collides with the MBO project** (`D:\mbo\...\apps\front`) — run with `--port 3002` when both are up |
| Storefront | 3001 | |
| MySQL | 3306 | set to `13306` on the dev machine — a native MySQL held 3306 *and* 3307 |
| Redis (cache) | 6379 | set to `16379` — native `redis-server` held 6379 |
| Redis (queues) | 6380 | set to `16380` |
| MongoDB | 27017 | set to `27117` — native `mongod` held 27017 |
| MailHog | 1025 / 8025 | |
| MinIO | 9000 / 9001 | |

> **Windows port collisions.** Docker's proxy and a native service can both bind
> the same port, with the native one winning for `127.0.0.1`. The symptom is an
> auth failure against what looks like the right container. Check
> `Get-NetTCPConnection -LocalPort <port> -State Listen` before debugging
> credentials.

**Two Redis instances is not redundancy.** `maxmemory-policy` is server-wide: the
cache needs `volatile-lru` so it sheds TTL'd entries under pressure, and BullMQ
requires `noeviction` or it silently loses queued jobs. One instance cannot be
both, and selecting a different DB index does not change the policy.

---

## Commands

```bash
pnpm dev                 # all three apps
pnpm dev:api             # API only (watch)
pnpm --filter @ems/api run dev:worker   # BullMQ worker + outbox relay

pnpm build · pnpm typecheck · pnpm test
pnpm test:integration    # Testcontainers against real MySQL/Redis/Mongo
pnpm test:isolation      # tenant leakage suite — blocking CI gate

pnpm db:migrate · pnpm db:revert · pnpm db:seed
pnpm db:reset            # destroys volumes, re-migrates, re-seeds

pnpm infra:up · infra:down · infra:reset · infra:logs
```

---

## Stack

**Frontend** — Next.js 15, TypeScript, React, Tailwind, ShadCN UI, TanStack Query, Zustand, React Hook Form, Zod, Axios
**Backend** — NestJS 11, TypeScript, TypeORM, Passport/JWT, Swagger, BullMQ, selective CQRS
**Data** — MySQL 8.4 (system of record) · MongoDB 7 (logs/analytics, TTL) · Redis 7 (cache, sessions, cart, queues)
**Infra** — Docker, Kubernetes, Nginx, Terraform, GitHub Actions, S3/CloudFront, Prometheus/Grafana, OpenTelemetry, Sentry

---

## Locked architectural decisions

| Decision | Choice |
|---|---|
| Tenant isolation | Shared schema + `tenant_id` discriminator, enforced by three independent layers |
| Primary RDBMS | MySQL 8.4 / InnoDB |
| Backend shape | Modular monolith, microservice-extractable via ports + domain events |
| Event delivery | Transactional outbox → relay → BullMQ (at-least-once, idempotent consumers) |
| CQRS | Selective — Order, Payment, Inventory, Subscription, Marketplace only |
| Cache invalidation | Version-counter namespacing (no `KEYS`/`SCAN` in production) |
| Money | `BIGINT` minor units + `Money` value object — never a float |
| Repo | pnpm workspaces + Turborepo; Zod contracts shared between API and both frontends |

Two of these were user decisions rather than defaults: shared-schema tenancy (over database-per-tenant) and MySQL (the project docx specified PostgreSQL; the build prompt specified MySQL and takes precedence). §4.4 of the architecture doc lists the MySQL gaps this creates and the compensating control for each.

---

## Non-negotiables

These are enforced in CI, not by convention:

1. **Tenant-isolation suite is a blocking gate.** Tenant A's token against tenant B's resources must return 404 (not 403 — a 403 confirms the row exists) on every console and storefront route. The suite ships in Phase 1 and grows with every endpoint.
2. **`synchronize: false` in every environment**, including local.
3. **Every async consumer is idempotent**, keyed on `(consumer_name, event_id)`, and tested against duplicate delivery.
4. **Every gateway call carries an idempotency key.** A duplicate charge is the most damaging bug this system can ship.
5. **Money never touches a float.**
6. **Swagger is generated from the same Zod schemas that validate requests**, so docs cannot drift from behaviour.
7. **Money ledgers are append-only.** Corrections are reversing entries, never updates.

---

## What Phase 1 delivered

**Tenancy — three independent enforcement layers.** MySQL has no row-level
security, so isolation is a code invariant and one forgotten `WHERE` clause is a
cross-tenant breach. One layer is not enough to bet the product on:

1. `TenantScopedRepository` injects the `tenant_id` predicate into every read and
   write. An array `where` is an OR in TypeORM, so the predicate is merged into
   *every* branch — merging into only the first would leave the rest unscoped.
2. `TenantGuardSubscriber` stamps `tenant_id` on insert and throws on any
   cross-tenant load, update or delete that escaped layer 1. `afterLoad` is the one
   that catches real bugs: the others check intent, it catches the query that
   fetched the wrong row.
3. `test/unit/tenant-coverage.spec.ts` fails the build if an entity is neither
   `@TenantScoped()` nor explicitly allowlisted as platform-global.

Layer 3 earned its place immediately — it caught `UserRoleEntity` as unclassified
on its first run.

**Transactional outbox.** Domain events are written inside the business
transaction, so event and state commit together or not at all. The relay claims
batches with `SELECT … FOR UPDATE SKIP LOCKED`, which lets N replicas run with no
coordination and no double-dispatch. Delivery is at-least-once by design, which is
why every consumer must be idempotent via `processed_events`.

**Async MongoDB logging.** Documents go to a bounded in-memory buffer inside
`setImmediate` and flush in unordered batches at `w:0`; the request never awaits a
log write. On overflow the buffer **drops and counts** — an unbounded queue in
front of a struggling database is just a slower memory leak. Errors and mutations
log at 100 %, successful GETs at 10 %.

**Also:** Zod-validated config that exits on a bad value rather than booting
half-configured; version-counter cache invalidation (one `INCR` per namespace,
never `SCAN`); `Money` as `bigint` minor units with largest-remainder allocation;
response envelope and error-code registry; 12 BullMQ queues with per-queue retry
policy; three-way health probes; Prometheus metrics; 197 permissions across 12
seeded roles.

---

## Verified in this build

- MySQL 8.4.11 · `READ-COMMITTED` · `utf8mb4_0900_ai_ci`
- 13 tables, 4 stored generated columns, 12 `CHECK` constraints, 5 quarterly
  `RANGE` partitions on `audit_logs`
- Migration `up()` → `down()` → `up()` round-trips cleanly
- Seeds idempotent across three consecutive runs
- Constraints enforce: same email allowed across two tenants, rejected within one;
  a `PLATFORM` user carrying a `tenant_id` is rejected
- Outbox: `order.placed` fanned to 3 queues, `payment.captured` to 2, an
  unroutable event to `dead-letter` rather than vanishing; re-dispatch produced
  **zero** duplicate jobs
- Logging: 5 of 60 requests sampled at exactly 10 %, with route pattern, handler,
  timing and redacted headers
- `Money`: 33/33 tests, including the allocation-sum invariant and
  `MAX_SAFE_INTEGER` overflow
- `turbo run typecheck test build` — 15/15 tasks pass

---

## Two schema fixes applied against docs/02

Both are corrections; the design doc should be updated to match.

1. **`users` uniqueness.** The doc paired `UNIQUE (tenant_id, email_normalized)`
   with `UNIQUE (user_type, email_normalized)`. The second would have made every
   tenant email globally unique, contradicting the doc's own stated intent that one
   person may hold accounts at two different stores. Replaced with a single key over
   a generated `tenant_scope` column (`IFNULL(tenant_id, 0)`), which dedupes
   platform users by email *and* tenant users per tenant.

2. **Functional key parts.** The doc used
   `PRIMARY KEY (…, (IFNULL(store_id, 0)))`. MySQL forbids functional key parts in
   a `PRIMARY KEY`, and NULL-distinctness would otherwise let the same grant be
   inserted repeatedly. `user_roles` and `roles` now use `STORED` generated scope
   columns inside real unique keys.

`roles.tenant_id` additionally uses `ON DELETE RESTRICT` rather than `CASCADE`,
because MySQL forbids `CASCADE` on a column that a stored generated column derives
from. Tenant deletion removes custom roles explicitly — the safer design regardless.

---

## Next step

**Phase 2 — Auth & RBAC.** Registration, email verification, login/logout, RS256
JWT with JWKS rotation, refresh rotation with family-level reuse detection, Redis
`jti` denylist, OTP, TOTP MFA, account lockout, `PermissionsGuard`, staff invites,
session management.

Exit criteria in [05 — Roadmap](./docs/05-roadmap.md#phase-2--auth-rbac-users).
