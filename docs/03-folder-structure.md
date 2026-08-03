# 03 — Folder Structure

Monorepo: **pnpm workspaces + Turborepo**.

Rationale: the API and both frontends must share Zod schemas and TypeScript types. In a polyrepo those types are either duplicated (they drift, and drift between a payment DTO and its form is a production bug) or published to a registry (a version bump on every field change). A monorepo makes the contract a compile-time import.

---

## 1. Top level

```
ems/
├── apps/
│   ├── api/                    # NestJS — HTTP surface + worker bootstrap
│   ├── console/                # Next.js — platform admin + merchant dashboard
│   └── storefront/             # Next.js — multi-tenant public storefront
├── packages/
│   ├── contracts/              # Zod schemas + inferred types (single source of truth)
│   ├── kernel/                 # framework-free domain primitives (Money, Result, ULID)
│   ├── ui/                     # ShadCN-based shared component library
│   ├── config-eslint/
│   ├── config-typescript/
│   └── config-tailwind/
├── infra/
│   ├── docker/
│   ├── nginx/
│   ├── k8s/
│   └── terraform/
├── docs/                       # this design set
├── scripts/                    # dev bootstrap, seed, codegen
├── .github/workflows/
├── docker-compose.yml
├── docker-compose.prod.yml
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
└── package.json
```

**Why two Next.js apps and not three, or one.** The console (admin + merchant) is auth-gated, client-heavy, and never indexed — one app with route groups is correct, and role gating already separates platform from merchant. The storefront is the opposite: public, SEO-critical, ISR-cached, and resolves its tenant from the `Host` header. Merging them would force one app to carry both a heavy authenticated bundle and a latency-sensitive public path, and a middleware mistake would let a shopper's request enter admin routing. Splitting them keeps the security boundary at the deployment level.

---

## 2. `apps/api` — NestJS

```
apps/api/
├── src/
│   ├── main.ts                       # HTTP bootstrap
│   ├── worker.ts                     # BullMQ bootstrap — same DI graph, no controllers
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── configuration.ts          # typed config factory
│   │   ├── env.schema.ts             # Zod — validated at boot, process exits on failure
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── mongo.config.ts
│   │   ├── jwt.config.ts
│   │   ├── storage.config.ts
│   │   └── queue.config.ts
│   │
│   ├── common/
│   │   ├── constants/
│   │   ├── decorators/
│   │   │   ├── public.decorator.ts
│   │   │   ├── permissions.decorator.ts
│   │   │   ├── platform-only.decorator.ts
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── current-tenant.decorator.ts
│   │   │   ├── tenant-scoped.decorator.ts     # entity marker; CI asserts coverage
│   │   │   ├── read-only.decorator.ts         # route reads from replica
│   │   │   ├── idempotent.decorator.ts
│   │   │   ├── api-paginated.decorator.ts
│   │   │   └── plan-quota.decorator.ts
│   │   ├── dto/
│   │   │   ├── pagination-query.dto.ts
│   │   │   ├── filter-query.dto.ts
│   │   │   └── id-param.dto.ts
│   │   ├── enums/
│   │   ├── errors/
│   │   │   ├── domain.error.ts                # base; carries a machine-readable code
│   │   │   ├── error-codes.enum.ts            # the ONE registry of API error codes
│   │   │   └── ...                            # NotFound, Conflict, Quota, CrossTenant…
│   │   ├── filters/
│   │   │   ├── global-exception.filter.ts
│   │   │   ├── typeorm-exception.filter.ts    # maps ER_DUP_ENTRY → 409, never leaks SQL
│   │   │   └── validation-exception.filter.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── refresh-token.guard.ts
│   │   │   ├── permissions.guard.ts
│   │   │   ├── tenant-status.guard.ts
│   │   │   ├── plan-quota.guard.ts
│   │   │   ├── resource-ownership.guard.ts
│   │   │   ├── api-key.guard.ts
│   │   │   ├── webhook-signature.guard.ts
│   │   │   └── throttle.guard.ts
│   │   ├── interceptors/
│   │   │   ├── response-envelope.interceptor.ts
│   │   │   ├── mongo-logging.interceptor.ts   # async, buffered, never blocking
│   │   │   ├── cache.interceptor.ts
│   │   │   ├── timeout.interceptor.ts
│   │   │   ├── idempotency.interceptor.ts
│   │   │   └── audit.interceptor.ts
│   │   ├── middleware/
│   │   │   ├── correlation-id.middleware.ts
│   │   │   ├── tenant-resolver.middleware.ts
│   │   │   ├── request-context.middleware.ts  # opens the AsyncLocalStorage store
│   │   │   └── raw-body.middleware.ts         # webhook HMAC needs the unparsed body
│   │   ├── pipes/
│   │   │   ├── zod-validation.pipe.ts
│   │   │   └── parse-public-id.pipe.ts
│   │   ├── services/
│   │   │   ├── tenant-context.service.ts      # ALS accessor
│   │   │   ├── crypto.service.ts              # AES-256-GCM field encryption
│   │   │   ├── hash.service.ts
│   │   │   ├── id.service.ts                  # ULID
│   │   │   ├── cache.service.ts               # version-counter namespacing
│   │   │   ├── lock.service.ts
│   │   │   └── outbox.service.ts
│   │   └── utils/
│   │
│   ├── database/
│   │   ├── data-source.ts                     # CLI datasource for migrations
│   │   ├── typeorm.module.ts
│   │   ├── migrations/
│   │   ├── seeds/
│   │   │   ├── permissions.seed.ts
│   │   │   ├── roles.seed.ts
│   │   │   ├── plans.seed.ts
│   │   │   ├── theme-templates.seed.ts
│   │   │   └── demo-tenant.seed.ts
│   │   ├── subscribers/
│   │   │   ├── tenant-guard.subscriber.ts     # isolation layer 2
│   │   │   └── audit.subscriber.ts
│   │   └── repositories/
│   │       ├── base.repository.ts
│   │       └── tenant-scoped.repository.ts    # isolation layer 1
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── tenant/
│   │   ├── subscription/
│   │   ├── store/
│   │   ├── product/
│   │   ├── category/
│   │   ├── brand/
│   │   ├── inventory/
│   │   ├── warehouse/
│   │   ├── customer/
│   │   ├── cart/
│   │   ├── order/
│   │   ├── payment/
│   │   ├── shipping/
│   │   ├── return/
│   │   ├── coupon/
│   │   ├── review/
│   │   ├── loyalty/
│   │   ├── tax/
│   │   ├── theme/
│   │   ├── cms/
│   │   ├── marketplace/            # product sharing, commission, settlement
│   │   ├── channel/                # Amazon, Flipkart, eBay, Meta, WhatsApp
│   │   ├── domain/                 # custom domains, DNS, SSL
│   │   ├── notification/
│   │   ├── media/
│   │   ├── analytics/
│   │   ├── report/
│   │   ├── support/
│   │   ├── logging/                # Mongo writers
│   │   ├── webhook/
│   │   ├── health/
│   │   └── platform/               # super-admin cross-tenant endpoints
│   │
│   ├── queues/
│   │   ├── queue.module.ts
│   │   ├── queue-names.enum.ts
│   │   └── processors/
│   │       ├── outbox-relay.processor.ts
│   │       ├── order-lifecycle.processor.ts
│   │       ├── payment-reconcile.processor.ts
│   │       ├── inventory-sync.processor.ts
│   │       ├── notification.processor.ts
│   │       ├── channel-sync.processor.ts
│   │       ├── import-export.processor.ts
│   │       ├── report-generation.processor.ts
│   │       ├── provisioning.processor.ts
│   │       ├── subscription-billing.processor.ts
│   │       ├── analytics-rollup.processor.ts
│   │       └── dead-letter.processor.ts
│   │
│   └── integrations/                # third-party adapters; one folder per vendor
│       ├── payment/
│       │   ├── payment-gateway.port.ts
│       │   ├── payment-gateway.factory.ts
│       │   ├── razorpay/  stripe/  paypal/  cashfree/  phonepe/
│       ├── shipping/
│       │   ├── shipping-carrier.port.ts
│       │   ├── delhivery/  shiprocket/  bluedart/  dtdc/  xpressbees/
│       ├── channel/
│       │   ├── channel-adapter.port.ts
│       │   ├── amazon/  flipkart/  ebay/  meta/  whatsapp/
│       ├── notification/
│       │   ├── email/  sms/  whatsapp/  push/
│       ├── storage/                 # S3-compatible
│       └── dns/                     # Route53/Cloudflare + ACME
│
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── tenant-isolation/            # the leakage suite — its own CI gate
│   ├── fixtures/
│   └── setup/                       # testcontainers for MySQL/Redis/Mongo
├── Dockerfile
├── nest-cli.json
├── tsconfig.json
└── package.json
```

### 2.1 Module anatomy by tier

Tiering exists because uniform structure across dissimilar modules is a cost, not a virtue: full DDD on `Brand` produces four files to do one repository call.

**Tier A — rich domain + CQRS** (`order`, `payment`, `inventory`, `subscription`, `marketplace`):

```
modules/order/
├── order.module.ts
├── domain/
│   ├── order.aggregate.ts            # invariants; ZERO framework imports
│   ├── order-line.ts
│   ├── value-objects/
│   ├── events/
│   ├── errors/
│   └── ports/                        # interfaces the application layer depends on
├── application/
│   ├── commands/
│   │   └── place-order/
│   │       ├── place-order.command.ts
│   │       ├── place-order.handler.ts
│   │       └── place-order.handler.spec.ts
│   ├── queries/
│   ├── sagas/
│   ├── event-handlers/
│   └── dto/
├── infrastructure/
│   ├── persistence/
│   │   ├── order.orm-entity.ts
│   │   ├── order.mapper.ts           # ORM entity ⇄ domain aggregate
│   │   └── order.repository.ts       # implements OrderRepositoryPort
│   └── services/
└── interface/
    ├── order.controller.ts
    ├── order-storefront.controller.ts
    ├── order-platform.controller.ts
    └── order.presenter.ts
```

**Tier B — service + repository** (`product`, `customer`, `coupon`, `shipping`, `theme`, `cms`, `notification`):

```
modules/product/
├── product.module.ts
├── product.controller.ts
├── product-storefront.controller.ts
├── product.service.ts
├── product.repository.ts
├── entities/
├── dto/
├── events/
└── __tests__/
```

**Tier C — thin CRUD** (`brand`, `category`, `warehouse`, `blog`, `banner`): `CrudService<T>` base plus a controller and entity. ~40 lines.

### 2.2 Boundary rules (ESLint-enforced, not conventional)

| Rule | Enforced by |
|---|---|
| `domain/` imports nothing but `domain/` and `@ems/kernel` | `no-restricted-imports` zone |
| Modules never import another module's `infrastructure/` or `domain/` — only its exported port | import zones |
| `EntityManager`/`DataSource` injectable only inside `infrastructure/` | `no-restricted-imports` |
| Controllers never inject a repository — always a service or handler | custom rule |
| No `any` in `packages/contracts` | `@typescript-eslint/no-explicit-any: error` |

The point of encoding these as lint errors is that architectural boundaries decay silently under deadline pressure. A CI failure is the only enforcement that survives.

---

## 3. `apps/console` — Next.js (admin + merchant)

```
apps/console/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── (auth)/                       # unauthenticated
│   │   │   ├── login/  register/  forgot-password/
│   │   │   ├── reset-password/  verify-email/  otp/
│   │   │   └── layout.tsx
│   │   ├── (onboarding)/                 # post-signup wizard
│   │   │   ├── choose-plan/  checkout/  choose-template/
│   │   │   ├── store-details/  provisioning/
│   │   │   └── layout.tsx
│   │   ├── (merchant)/                   # STORE_* roles
│   │   │   ├── layout.tsx                # sidebar + store switcher
│   │   │   ├── dashboard/
│   │   │   ├── products/
│   │   │   │   ├── page.tsx  new/  [id]/edit/
│   │   │   │   ├── import/  export/
│   │   │   │   └── _components/
│   │   │   ├── categories/  brands/  inventory/
│   │   │   ├── orders/[id]/               # detail, invoice, packing-slip, refund
│   │   │   ├── returns/  customers/  reviews/
│   │   │   ├── coupons/  gift-cards/  loyalty/
│   │   │   ├── shipping/  payments/
│   │   │   ├── marketplace/               # supplier + reseller dashboards
│   │   │   │   ├── shared-products/  incoming-requests/
│   │   │   │   ├── commissions/  settlements/
│   │   │   ├── channels/[type]/
│   │   │   ├── website/
│   │   │   │   ├── themes/  builder/  banners/
│   │   │   │   ├── pages/  blogs/  menus/  seo/
│   │   │   ├── reports/[type]/
│   │   │   ├── settings/                  # store, tax, staff, roles, domains, api-keys, webhooks
│   │   │   └── subscription/
│   │   ├── (platform)/                   # PLATFORM_* roles only
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   ├── tenants/[id]/
│   │   │   ├── plans/  templates/  domains/
│   │   │   ├── payments/  settlements/
│   │   │   ├── tickets/[id]/
│   │   │   ├── logs/                      # api, error, auth, webhook, job
│   │   │   ├── queues/                    # depth, failures, replay
│   │   │   └── analytics/
│   │   └── api/                           # BFF only: token refresh, file proxy
│   ├── components/
│   │   ├── ui/                            # ShadCN primitives
│   │   ├── forms/                         # RHF + Zod field wrappers
│   │   ├── data-table/                    # server-side pagination/sort/filter
│   │   ├── charts/  layout/  feedback/
│   │   └── domain/                        # ProductForm, OrderTimeline, VariantMatrix…
│   ├── hooks/
│   │   ├── queries/                       # one file per resource: useProducts, useOrders…
│   │   ├── mutations/
│   │   └── use-permissions.ts  use-debounce.ts  use-store-switcher.ts
│   ├── services/
│   │   ├── api-client.ts                  # Axios instance: auth, refresh, correlation id
│   │   ├── query-client.ts                # TanStack defaults + query-key factory
│   │   └── <resource>.service.ts
│   ├── store/                             # Zustand — UI state ONLY
│   │   ├── auth.store.ts  ui.store.ts
│   │   ├── store-context.store.ts         # active store for multi-store tenants
│   │   └── theme-builder.store.ts         # complex local editor state
│   ├── lib/
│   ├── types/
│   ├── middleware.ts                      # route protection by role
│   └── styles/
├── public/
├── Dockerfile
└── next.config.ts
```

### 3.1 State management boundary

The most common failure in this stack is duplicating server data into a global store, then fighting two sources of truth.

| Concern | Owner |
|---|---|
| Server data (products, orders, customers) | **TanStack Query** — cache, refetch, invalidation |
| Session/user/permissions | Zustand (`auth.store`), hydrated once from `/auth/me` |
| UI state (sidebar, modals, active store) | Zustand |
| Form state | React Hook Form + Zod resolver |
| URL-derived state (filters, page, sort) | **`useSearchParams`** — shareable, back-button-correct, survives refresh |

Server data **never** enters Zustand. Filters and pagination live in the URL, not in a store, so a merchant can bookmark "unfulfilled orders, page 3" and send it to a colleague.

Query keys come from a typed factory so invalidation cannot typo:

```ts
export const productKeys = {
  all:    ['products'] as const,
  lists:  () => [...productKeys.all, 'list'] as const,
  list:   (f: ProductFilters) => [...productKeys.lists(), f] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
}
```

---

## 4. `apps/storefront` — Next.js (multi-tenant public)

```
apps/storefront/
├── src/
│   ├── middleware.ts                     # Host → tenant; rewrite; inject headers
│   ├── app/
│   │   ├── layout.tsx
│   │   └── _tenant/[tenantId]/
│   │       ├── layout.tsx                # theme tokens → CSS custom properties
│   │       ├── page.tsx                  # home (ISR, tagged)
│   │       ├── products/[slug]/
│   │       ├── collections/[slug]/
│   │       ├── search/
│   │       ├── cart/  checkout/
│   │       ├── account/                  # orders, addresses, wishlist, loyalty
│   │       ├── pages/[slug]/  blog/[slug]/
│   │       ├── sitemap.xml/  robots.txt/
│   │       └── opengraph-image.tsx
│   ├── components/
│   │   ├── sections/                     # theme-driven homepage sections
│   │   ├── product/  cart/  checkout/  layout/
│   ├── lib/
│   │   ├── tenant.ts                     # server-side tenant resolution + cache
│   │   ├── theme.ts                      # config → CSS custom properties
│   │   └── api.ts                        # server-side storefront client
│   ├── hooks/
│   └── styles/
├── Dockerfile
└── next.config.ts
```

**Theme rendering.** A merchant's colors/fonts become CSS custom properties injected in the tenant layout — one shared Tailwind build serves every tenant. Per-tenant Tailwind builds would mean a rebuild per customization, which does not survive past a few hundred stores.

**Cache tags** — `tenant:{id}`, `product:{id}`, `category:{id}`, `theme:{id}`. A product write calls `revalidateTag('product:123')`, so prices update in seconds while everything stays statically served.

---

## 5. `packages/`

### `packages/contracts` — the shared contract

```
packages/contracts/src/
├── common/          # pagination, envelope, error codes, primitives
├── auth/  tenant/  subscription/  store/  product/  category/
├── inventory/  customer/  cart/  order/  payment/  shipping/
├── coupon/  review/  theme/  cms/  marketplace/  channel/
├── report/  notification/
└── index.ts
```

Each resource exports Zod schemas plus inferred types:

```ts
export const createProductSchema = z.object({
  name: z.string().min(1).max(500),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  type: z.enum(['SIMPLE','VARIABLE','DIGITAL','BUNDLE','SERVICE']),
  priceMinor: z.number().int().nonnegative(),
  // …
})
export type CreateProductDto = z.infer<typeof createProductSchema>
```

**The same schema validates the NestJS request body and the React Hook Form.** Validation rules cannot drift between client and server, and adding a required field is a type error in the form rather than a runtime 422 discovered by a merchant.

### `packages/kernel` — framework-free primitives

`Money`, `Result<T,E>`, `Ulid`, `DomainEvent`, `AggregateRoot`, `Entity`, `ValueObject`, `Guard`, `Paginated<T>`.

Zero dependencies by design — importable from `domain/` layers without dragging in Nest, TypeORM, or React.

### `packages/ui`
ShadCN components, `cn()` helper, and shared Tailwind preset. Consumed by both frontends.

---

## 6. `infra/`

```
infra/
├── docker/
│   ├── api.Dockerfile  console.Dockerfile  storefront.Dockerfile
│   └── mysql/  redis/  mongo/            # init scripts, conf
├── nginx/
│   ├── nginx.conf
│   ├── console.conf  storefront.conf     # wildcard + custom-domain server blocks
│   └── snippets/                         # ssl, security-headers, gzip/brotli, cache
├── k8s/
│   ├── base/                             # deployments, services, hpa, ingress, migration job
│   └── overlays/{dev,staging,prod}/       # kustomize
└── terraform/
    └── modules/{vpc,rds,elasticache,documentdb,eks,s3,cloudfront,acm,route53}/
```

---

## 7. Turborepo pipeline

```jsonc
// turbo.json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"] },
    "test:e2e":  { "dependsOn": ["build"], "cache": false },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

`packages/contracts` builds before either frontend, so a schema change surfaces as a typecheck failure in the console rather than a runtime error. Remote caching keeps CI in the low minutes as the repo grows.

---

**Next:** [04 — API Conventions](./04-api-conventions.md) · [05 — Roadmap](./05-roadmap.md)
