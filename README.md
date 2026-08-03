# EMS — Multi-Tenant E-Commerce Management SaaS

A production-grade, multi-tenant e-commerce SaaS platform: merchants sign up, pick a plan and a template, and get a fully provisioned online store with payments, logistics, a website builder, multi-channel selling, and an internal supplier/reseller marketplace.

**Current status:** design phase complete. No application code written yet.

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

## Next step

Phase 1 — foundation and tenancy core. See [05 — Roadmap](./docs/05-roadmap.md#recommended-first-build-step) for the ordered task list.
