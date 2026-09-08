# EMS — Security Report (QA Phase 6, Part A: Tenant Isolation)

**Phase:** 6 — Security (P0 release gate)
**Executed:** 2026-09-07, live against the running dev stack
**Scope:** Cross-tenant isolation across the console API, the storefront surface, and
tenant resolution. RBAC results are in `PERMISSION_MATRIX.md`.
**Method:** Direct API probing with real captured JWTs (`POST /api/v1/auth/login`),
not the UI. Where the UI was used it is labelled as such and is never treated as
evidence that the backend enforces anything.

---

## 0. Final verdict

> **Tenant isolation was BROKEN (SEC-001) — fixed and retested 2026-09-08. See §3 for the fix and live retest evidence.**

This is not a hedge and not a near-miss. A `STORE_OWNER` of tenant `lakeside`
can, with nothing but their own valid token and a plain HTTP client:

- **read** every support ticket belonging to tenant `northwind`, including subject,
  priority, SLA state, requester id, and the full message thread body; and
- **write** into a `northwind` ticket — appending a message and changing the
  ticket's status — with the write persisting to MySQL.

Reproduced repeatedly, confirmed at the database level, and root-caused. It is a
cross-tenant read **and** mutation, so it is P0 and a release blocker on its own.

Everything else held. Specifically, all eight resource types named in the Phase 6
mandate — Products, Orders, Customers, Inventory, Coupons, Reviews, Warehouses,
Stores — plus their nested sub-resources, refused every cross-tenant attempt with
`404 RESOURCE_NOT_FOUND`. There were **zero** `403`-instead-of-`404`
existence-leak findings anywhere in the run, which is a genuinely good result: the
documented design intent ("404 and not 403 … the leak is impossible rather than
merely avoided", `database/repositories/tenant-scoped.repository.ts`) is what the
system actually does.

The single failure is not a failure of the isolation machinery. It is a resource
that was **deliberately exempted** from that machinery and then given a
tenant-facing API. See §5.

---

## 1. Summary table

| Metric | Count |
|---|---|
| Isolation test cases executed | **224** |
| PASS | **211** |
| FAIL | **8** (all attributable to SEC-001) |
| PASS with caveat (rejected before the isolation check — see §4.1) | 10 |
| BLOCKED (environment, cannot be tested here) | 2 |
| NOT TESTED (finding raised by code inspection only) | 1 |
| Bugs raised | 5 (1×P0, 0×P1, 2×P2, 2×P3) |
| `403`-instead-of-`404` existence leaks found | **0** |

Breakdown by test group:

| Group | Cases | PASS | FAIL | Notes |
|---|---|---|---|---|
| A1. Curated cross-tenant resource matrix (both directions) | 81 | 72 | 1 | 8 "PASS*" (§4.1) |
| A2. Triage / mutation-verification probes | 29 | 29 | 0 | Confirms no probe actually mutated anything |
| A3. Platform-global allowlisted entity surfaces | 30 | 24 | 6 | All 6 failures = SEC-001 |
| A4. Storefront + tenant-resolution / header forging | 40 | 38 | 0 | 2 BLOCKED |
| A5. Systematic list-endpoint sweep (44 endpoints × 2 tenants) | 44 | 43 | 1 | SEC-001 again |
| **Total** | **224** | **211** | **8** | |

| Severity | Bug IDs |
|---|---|
| **P0** | SEC-001 |
| P1 | *(none)* |
| P2 | SEC-002, SEC-003 |
| P3 | SEC-004, SEC-005 |

---

## 2. Environment and test data

| Item | Value |
|---|---|
| API | `http://localhost:4000/api/v1` (running, healthy) |
| Console | `http://localhost:3000` |
| Storefront | `http://<slug>.ems.localhost:3001` |
| MySQL | `127.0.0.1:3307`, db `ems` (native Windows install, reachable) |
| Tenants | `northwind` (internal id `1`), `lakeside` (internal id `2`) |
| Seeded password | `DemoPassword123!` — **verified live**, all 5 seeded accounts log in (200) |

All 5 seeded logins were confirmed working rather than assumed:

| Account | Status | Role | Tenant | Permissions in token |
|---|---|---|---|---|
| `admin@ems.test` | 200 | `PLATFORM_SUPER_ADMIN` | *(null — platform)* | 45 |
| `owner@northwind.test` | 200 | `STORE_OWNER` | northwind | 160 |
| `ops@northwind.test` | 200 | `ORDER_MANAGER` | northwind | 22 |
| `owner@lakeside.test` | 200 | `STORE_OWNER` | lakeside | 160 |
| `ops@lakeside.test` | 200 | `PRODUCT_MANAGER` | lakeside | 29 |

### 2.1 Lakeside was empty — QA data created so both sides could be probed

Confirmed by direct SQL that `lakeside` had **0** products, orders, customers,
coupons, reviews, warehouses and stores, so bidirectional testing was impossible
as-found. Data was created through the real API only (no direct DB inserts):

1. `POST /console/provisioning/retry` as `owner@lakeside.test` → ran the real
   provisioning steps inline, creating `Lakeside Supply Co` (store) and
   `MAIN` (warehouse). Steps `TENANT_ACTIVATED`, `STORE_CREATED`,
   `SUBDOMAIN_ASSIGNED` all `COMPLETED`.
2. Then, via the normal console/storefront endpoints: `QA-Lakeside Isolation Probe
   Widget` (product, published, stock adjusted), `qa-lakeside-probe@qa.test`
   (customer + address + wishlist entry), `QA-LK-PROBE10` (coupon), one storefront
   review, and one real COD order `ORD-000001` placed through
   `POST /storefront/checkout/orders`.

### 2.2 Sacrificial QA resources in northwind — real data was never the target

Destructive cross-tenant probes (`DELETE`, `cancel`, `moderate`, `refund`) were
pointed at purpose-built `QA-Northwind Sacrificial *` resources, **not** at
northwind's real pre-existing data (`ORD-000004`, `Laptop Riser — Aluminium`, the
real customer, the real reviews). Read-only probes did use real ids, since a
successful read of real data is the more meaningful evidence.

### 2.3 Disclosure: one piece of real pre-existing data was modified

**This must be read before the bug reports.** Confirming SEC-001's *write* path
modified a real, pre-existing northwind support ticket:

- Ticket `01M1W4S6HA7T8D2YDN7T5MNVKY` (`TKT-MTQ8HP9L`, "Cannot connect payment
  gateway") had its `status` changed `OPEN` → `IN_PROGRESS`, and message id `3`
  ("QA Phase 6 cross-tenant probe message", `author_id=3` = the lakeside owner)
  was appended to its thread at `2026-09-07 17:38:48.900`.

This was a QA-caused change, not a pre-existing condition, and it is not
reversible through the API (`resolve`/`close` require `platform.support:*`, and
there is no message-delete endpoint). It happened because the ticket surface was
not on the mandate's resource list and was reached during an own-tenant control
check, before it was known to be leaky. Once the leak was understood, the write
path was **re-confirmed against a QA-created ticket instead**
(`01M1YGX75AVMRZ5ZN06ZPWT5N0`, "QA-Phase6 sacrificial ticket (northwind)"), and
that re-confirmation is the evidence cited in SEC-001. Whoever fixes this should
clean up ticket 1's status and message 3.

---

## 3. Bug reports

### SEC-001 — Cross-tenant read *and* write of support tickets

| Field | Value |
|---|---|
| **Bug ID** | SEC-001 |
| **Severity** | **P0** — cross-tenant data access and mutation. Release blocker. |
| **Module** | Support (`apps/api/src/modules/support`) |
| **Page** | None — API only. The console has no support-ticket page (per `QA_REPORT.md` §2.1), so this is **not** reachable through the UI, only through the API. That reduces the chance of accidental discovery; it does not reduce the severity. |
| **Environment** | API `http://localhost:4000`, MySQL `127.0.0.1:3307` db `ems`, 2026-09-07 |
| **User** | `owner@lakeside.test` (`STORE_OWNER`, uid 3) — also reproduced with `ops@lakeside.test` (`PRODUCT_MANAGER`), so it is not role-dependent |
| **Tenant** | Attacker `lakeside` (id 2); victim `northwind` (id 1) |
| **Precondition** | Any authenticated tenant user of any tenant. No special permission is needed — the read routes carry **no** `@Permissions()` decorator at all. At least one support ticket exists in another tenant. |

**Steps to Reproduce**

1. `POST /api/v1/auth/login` with `owner@lakeside.test` / `DemoPassword123!`; keep `accessToken`.
2. `GET /api/v1/console/support-tickets` with that bearer token, **no query parameters**.
3. Observe northwind's tickets in the response (`tenantId: "1"`).
4. Take a ticket id from step 3 and `GET /api/v1/console/support-tickets/<id>` → full ticket.
5. `GET /api/v1/console/support-tickets/<id>/messages` → the full message thread body.
6. `POST /api/v1/console/support-tickets/<id>/messages` with `{"body":"..."}` → **201**, message appended, ticket status advanced.
7. Log in as `owner@northwind.test` and re-read the thread — the foreign message is there.

**Expected Result**

`404 RESOURCE_NOT_FOUND` on steps 3–6 (the ticket belongs to another tenant, and
per the project's own documented rule a cross-tenant row must be indistinguishable
from a non-existent one). At minimum, step 2 must return only the caller's own
tenant's tickets.

**Actual Result**

`200` on steps 2–5 with another tenant's data, and `201` on step 6 with the write
persisted.

**Evidence**

Step 2, same request issued as three different users:

```
owner@northwind.test -> 200 n=2
   ticket=01M1W4S6HA7T8D2YDN7T5MNVKY num=TKT-MTQ8HP9L tenantId=1 requester=1 subject="Cannot connect payment gateway"
   ticket=01M1W51VD81RR6HNXPNMWG2JMW num=TKT-MTQ8NS13 tenantId=1 requester=1 subject="timezone verification ticket"

owner@lakeside.test  -> 200 n=2          <-- identical rows, foreign tenant
   ticket=01M1W4S6HA7T8D2YDN7T5MNVKY num=TKT-MTQ8HP9L tenantId=1 requester=1 subject="Cannot connect payment gateway"
   ticket=01M1W51VD81RR6HNXPNMWG2JMW num=TKT-MTQ8NS13 tenantId=1 requester=1 subject="timezone verification ticket"

ops@lakeside.test    -> 200 n=2          <-- also leaks to a PRODUCT_MANAGER
   ticket=01M1W4S6HA7T8D2YDN7T5MNVKY num=TKT-MTQ8HP9L tenantId=1 requester=1 subject="Cannot connect payment gateway"
   ticket=01M1W51VD81RR6HNXPNMWG2JMW num=TKT-MTQ8NS13 tenantId=1 requester=1 subject="timezone verification ticket"
```

The `tenantId: "1"` in the response body is how the leak was spotted; lakeside's
own internal tenant id is `2` (verified from the JWT `tid` claim of both owners:
northwind `tid=1`, lakeside `tid=2`).

Write path, re-confirmed on a QA-created ticket (see §2.3):

```
NW creates QA ticket  -> 201 01M1YGX75AVMRZ5ZN06ZPWT5N0 tenantId= 1
LK reads NW QA ticket -> 200 {"id":"01M1YGX75AVMRZ5ZN06ZPWT5N0","ticketNumber":"TKT-MTRK0LGO",
                             "tenantId":"1","requesterUserId":"1",
                             "subject":"QA-Phase6 sacrificial ticket (northwind)","status":"OPEN",...}
LK writes to NW QA ticket -> 201  status now= IN_PROGRESS
thread -> [{"id":"4","authorType":"REQUESTER","authorId":"1","body":"QA Phase 6 isolation probe target."},
           {"id":"5","authorType":"REQUESTER","authorId":"3","body":"QA Phase 6: cross-tenant write confirmation"}]
```

Database confirmation (`author_id=3` is the lakeside owner; every ticket is
`tenant_id=1`):

```sql
mysql> SELECT id, public_id, tenant_id, ticket_number, status FROM support_tickets ORDER BY id;
1  01M1W4S6HA7T8D2YDN7T5MNVKY  1  TKT-MTQ8HP9L  IN_PROGRESS
2  01M1W51VD81RR6HNXPNMWG2JMW  1  TKT-MTQ8NS13  OPEN
3  01M1YGX75AVMRZ5ZN06ZPWT5N0  1  TKT-MTRK0LGO  IN_PROGRESS

mysql> SELECT id, ticket_id, author_id, LEFT(body,50) FROM support_ticket_messages ORDER BY id;
1  1  1  Getting an error when trying to connect Razorpay
2  2  1  checking createdAt after tz fix
3  1  3  QA Phase 6 cross-tenant probe message              <-- foreign tenant write
4  3  1  QA Phase 6 isolation probe target.
5  3  3  QA Phase 6: cross-tenant write confirmation        <-- foreign tenant write
```

The systematic sweep (§4.5) independently isolated this as the only leaking
endpoint out of 44: `support-tickets` shared **6** identifiers between the two
tenants (3 public ids + 3 ticket numbers), while every other tenant-owned
endpoint shared **0**.

**Console Error** — n/a (no UI for this module).

**Network Error** — n/a; the requests succeed. That is the bug.

**API**

```
GET  /api/v1/console/support-tickets
GET  /api/v1/console/support-tickets/:id
GET  /api/v1/console/support-tickets/:id/messages
POST /api/v1/console/support-tickets/:id/messages
```

**Request**

```http
GET /api/v1/console/support-tickets HTTP/1.1
Host: localhost:4000
Authorization: Bearer <owner@lakeside.test access token, tid=2>
```

```http
POST /api/v1/console/support-tickets/01M1YGX75AVMRZ5ZN06ZPWT5N0/messages HTTP/1.1
Host: localhost:4000
Authorization: Bearer <owner@lakeside.test access token, tid=2>
Content-Type: application/json

{"body":"QA Phase 6: cross-tenant write confirmation"}
```

**Response**

```json
201 Created
{"success":true,
 "data":{"id":"01M1YGX75AVMRZ5ZN06ZPWT5N0","ticketNumber":"TKT-MTRK0LGO",
         "tenantId":"1","requesterUserId":"1",
         "subject":"QA-Phase6 sacrificial ticket (northwind)","status":"IN_PROGRESS"}}
```

**Root Cause**

Four things line up, and all four have to be true for the leak to exist:

1. `SupportTicketEntity` and `SupportTicketMessageEntity` are on the
   `PLATFORM_GLOBAL_ENTITIES` allowlist
   (`apps/api/src/common/decorators/tenant-scoped.decorator.ts:93,97`). That
   removes them from isolation layer 1 (`TenantScopedRepository`), layer 2
   (`TenantGuardSubscriber`) and layer 3 (the `tenant-coverage.spec.ts` CI gate)
   simultaneously. The three defences the architecture relies on are all opt-in on
   the decorator, so one allowlist entry disables all of them at once.

2. `SupportTicketRepository`
   (`apps/api/src/modules/support/support-ticket.repository.ts`) is therefore a
   plain TypeORM repository. `findByPublicId` is
   `this.repository.findOne({ where: { publicId } })` — no tenant predicate — and
   `listAll()` is `find({ where: status ? { status } : {} })`, i.e. every tenant's
   rows.

3. The allowlist comment says the tenant's own view is "an explicit
   `requesterUserId`/`tenantId` filter here, not an ambient scope", and
   `SupportTicketService.list()` does branch that way — but the branch is chosen by
   the caller-supplied `mineOnly` flag, which
   **`listSupportTicketsQuerySchema` defaults to `false`**
   (`packages/contracts/src/support/…: mineOnly: z.coerce.boolean().default(false)`).
   So the default, no-parameter request — exactly what any normal client sends —
   takes the `listAll()` platform branch. Nothing checks
   `context.isPlatformRequest` before doing so, even though
   `isPlatformRequest` is already used two methods away in `addMessage()`.

4. `GET :id`, `GET :id/messages` and `POST :id/messages` carry **no
   `@Permissions()` decorator**, which `PermissionsGuard` treats as
   "authenticated but permissionless — legitimate for 'my own profile' routes"
   and allows. Combined with (2)'s unscoped lookup, any authenticated user of any
   tenant can address any ticket by public id. The controller's own doc comment
   claims "platform staff see every tenant's; others see only their own" — the
   intent is documented, just not implemented.

Note that the `mineOnly` coercion is itself broken and masks the problem in
testing: `z.coerce.boolean()` makes any non-empty string truthy, so
`?mineOnly=false` becomes `true`. Measured directly:

```
LK ?mineOnly=true   -> 200 n=0     (correct: lakeside has no tickets)
LK ?mineOnly=false  -> 200 n=0     (WRONG: "false" coerces to true -> safe by accident)
LK (no parameter)   -> 200 n=3     (LEAK: default false -> listAll())
```

So the only way to *see* the leak is to omit the parameter, and the only way to
explicitly ask for the unsafe behaviour accidentally gives you the safe one.

**Fix Applied** (2026-09-08, explicitly authorized after this report was reviewed)

Implemented exactly the structural fix recommended below, not a patch on top of
the broken flag:

- `SupportTicketEntity` is now `@TenantScoped()` and removed from
  `PLATFORM_GLOBAL_ENTITIES` (`apps/api/src/database/entities/support-ticket.entity.ts`,
  `apps/api/src/common/decorators/tenant-scoped.decorator.ts`).
  `SupportTicketMessageEntity` stays on the allowlist — join-table shape, no
  `tenant_id` of its own, and its isolation is transitive through `ticket_id`,
  which is now itself checked before any message is reached.
- `SupportTicketRepository` now extends `TenantScopedRepository<SupportTicketEntity>`
  instead of being a plain repository. Two methods deliberately keep the
  unscoped `this.repository` access for platform staff —
  `listAllAcrossTenants()` and `findByPublicIdAcrossTenantsOrFail()` — visible,
  named exceptions rather than an ambient default.
- `SupportTicketService` now branches on `context.isPlatformRequest`, never on
  the client-supplied `mineOnly` flag, to decide whether a caller can reach
  `listAllAcrossTenants()`/`findByPublicIdAcrossTenantsOrFail()` at all. A
  tenant caller is always confined to their own tenant (via the ordinary
  tenant-scoped `find`/`findByPublicIdOrFail`); `mineOnly` now only narrows
  *within* that tenant (their own tickets vs. their whole tenant's).
  `assign`/`resolve`/`close` (already `platform.support:*`-gated) always use
  the across-tenant lookup, since only platform staff can reach them anyway.
- Fixed the root cause of why the leak was invisible in casual testing: added
  a real `booleanQuerySchema` (`packages/contracts/src/common/primitives.ts`)
  and swapped every `z.coerce.boolean()` in the contracts package for it —
  6 call sites total (`mineOnly` here, plus `isActive` on brands/categories,
  `lowStockOnly` on inventory, `unreadOnly` on notifications, `isFeatured` on
  products). All shared the identical defect: `?flag=false` coerced to `true`.

**Retest Status — RETESTED, PASS.** Reproduced the exact original exploit steps
live against the fixed code:

```
LK token, GET /console/support-tickets (no params)          -> 200 {"data":[]}          (was: northwind's 2 tickets)
LK token, GET /console/support-tickets/<nw real ticket id>  -> 404                       (was: 200, full ticket)
LK token, POST .../<nw QA ticket>/messages {"body":"..."}   -> 404                       (was: 201, write persisted)
NW token, GET /console/support-tickets (own)                -> 200, own 2 tickets, unaffected
NW token, GET ?mineOnly=false                                -> 200, tenant-wide (both tickets) — flag now means what it says
```

`tsc --noEmit` clean; all 138 unit tests pass, including
`test/unit/tenant-coverage.spec.ts` (which now sees `SupportTicketEntity`
correctly classified) and `test/unit/route-exposure.spec.ts`.

The dedicated `test/tenant-isolation/isolation.spec.ts` suite could **not**
be run to completion in this environment: its `beforeEach` provisions a
fresh tenant before every one of its 13 tests, and real tenant provisioning
enqueues BullMQ jobs — which hang indefinitely against the local queue Redis
(port 6380) that this sandbox does not have, a constraint already on record
in `QA_REPORT.md` §5, unrelated to this fix. Two separate attempts confirmed
the same hang (one had to be killed after running two overlapping instances
by mistake, which only added noise, not a different outcome). This is marked
**BLOCKED**, not run, not a fix regression — the live direct-API retest above
is the evidence for this fix, independent of that suite.

The one piece of real data this bug's discovery mutated — northwind ticket
`01M1W4S6HA7T8D2YDN7T5MNVKY` — was reverted by direct, user-confirmed SQL
(status restored to `OPEN`, the injected message deleted) after the fix was
verified, not before, so the before/after evidence above is against the
actual mutated state, not a cleaned-up one.

---

### SEC-002 — Unverified custom domains appear to resolve a tenant (code inspection only)

| Field | Value |
|---|---|
| **Bug ID** | SEC-002 |
| **Severity** | P2 |
| **Module** | Tenant resolution (`apps/api/src/common/middleware/tenant-resolver.middleware.ts`) |
| **Page** | Storefront, all pages |
| **Environment** | As §2 |
| **User** | Any tenant user holding `domain:create` (`STORE_OWNER`, `STORE_ADMIN`) |
| **Tenant** | Any |
| **Precondition** | A tenant adds a custom domain via `POST /console/domains`. |

**Steps to Reproduce** — **could not be completed. See Actual Result.**

1. `POST /api/v1/console/domains` with `{"hostname":"qa-unverified-probe.ems.localhost","type":"CUSTOM"}` as `owner@lakeside.test`.
2. Without verifying DNS, send `GET /api/v1/storefront/products` with `x-ems-hostname: qa-unverified-probe.ems.localhost`.
3. Observe whether lakeside's catalogue is returned.

**Expected Result** — step 2 returns no tenant context (`400 TENANT_CONTEXT_MISSING`)
until the domain's ownership is actually verified.

**Actual Result** — **BLOCKED.** Step 1 never returns. `DomainService.addCustomDomain()`
ends with `await this.enqueueOwnershipCheck(...)`, a BullMQ enqueue, and the local
queue Redis (port 6380) is not available in this environment — a documented
constraint in `QA_REPORT.md` §5. The request hangs until the client aborts
(reproduced twice, 20s and >180s client timeouts). This hang is itself the known
environment constraint, **not** a code bug.

The underlying concern is therefore raised on code inspection, and is marked
**NOT TESTED**, not FAIL:

```sql
-- TenantResolverMiddleware.lookupDomain()
SELECT d.tenant_id, d.store_id, t.slug, t.status
  FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id
 WHERE d.hostname = ? AND t.deleted_at IS NULL
 LIMIT 1
```

There is no `d.verified_at IS NOT NULL`, no `d.is_live`, and no predicate on
`t.status` — the status column is selected and written into the request context but
not gated here. On that reading, a merchant could register a hostname they do not
own and have the platform serve *their own* store under it. Note this is a
domain-squatting / phishing concern, **not** a cross-tenant one: it lets a tenant
serve its own data under a wrong name, never another tenant's data. Hostname
uniqueness is enforced (`findByHostnameGlobal` → `ConflictError`), and this was
verified live to the extent possible: lakeside attempting to claim
`northwind.ems.localhost` is the same blocked code path.

**Evidence** — `apps/api/src/common/middleware/tenant-resolver.middleware.ts:136-145`;
`apps/api/src/modules/domain/domain.service.ts:29-47`.

**Root Cause** — `lookupDomain()` keys only on `hostname`; verification state lives
in `tenant_domains.verified_at` and `is_live` and is not consulted.

**Suggested Fix** — add `AND d.verified_at IS NOT NULL` (and a decision on
`t.status`) to the lookup, or resolve only domains the domain module considers live.
Needs a working queue Redis to test either way.

**Retest Status** — NOT TESTED (blocked on queue Redis).

---

### SEC-003 — `detectSurface()` derives the security surface from an attacker-controlled URL

| Field | Value |
|---|---|
| **Bug ID** | SEC-003 |
| **Severity** | P2 (latent — currently fails closed, no exploit demonstrated) |
| **Module** | `apps/api/src/common/middleware/request-context.middleware.ts` |
| **Page** | All API surfaces |
| **Environment** | As §2 |
| **User** | Any caller, authenticated or not |
| **Tenant** | Any |
| **Precondition** | None. |

**Steps to Reproduce**

1. `GET /api/v1/storefront/products?limit=50&x=/platform/` with `x-ems-hostname: northwind.ems.localhost`.
2. Compare with the control, `GET /api/v1/storefront/products?limit=50` and the same header.

**Expected Result** — identical: an arbitrary query parameter must not change how the
request is classified.

**Actual Result** — the classification changes and the request breaks:

```
storefront + "&x=/platform/" no hdr -> 400 TENANT_CONTEXT_MISSING n=0
storefront + "&x=/platform/" nw hdr -> 400 TENANT_CONTEXT_MISSING n=0
storefront + "&x=/console/"  nw hdr -> 200 n=15   (unchanged)
storefront control           nw hdr -> 200 n=15
```

`detectSurface()` is `url.includes('/platform/')` etc. over
`req.originalUrl ?? req.url`, which **includes the query string**. A caller can
therefore choose the surface, and with it which tenant-resolution strategy runs
(`TenantResolverMiddleware`) — and, per that middleware's own class comment, which
CSP/CORS policy the response gets.

Today this fails closed and leaks nothing. Every attempt to abuse it was rejected:

```
console + "&x=/storefront/"  (LK token) -> 200 n=1  ["QA-Lakeside Isolation Probe Widget"]   (own tenant only)
console + "&x=/platform/"    (LK token) -> 200 n=1  ["QA-Lakeside Isolation Probe Widget"]   (own tenant only)
console + "&x=/webhooks/"    (LK token) -> 200 n=1  ["QA-Lakeside Isolation Probe Widget"]   (own tenant only)
GET /platform/settlements/pending-approval?x=/console/  (LK token) -> 403 PERMISSION_DENIED
```

The reason the console direction is safe is worth recording, because it is a real
strength of the design and not an accident: `TenantResolverMiddleware` deliberately
resolves nothing for the console surface, and `JwtAuthGuard` patches the tenant
context from the **verified** `tid` claim *after* the middleware runs, so a
host-derived tenant is overwritten by the token's own. The forged-surface trick
cannot beat that ordering.

**Evidence** — `request-context.middleware.ts:57-63`. Live results above.

**Root Cause** — surface is inferred from a string that includes attacker-controlled
query data instead of from the matched route or the path only.

**Suggested Fix** — split the query string off before matching
(`url.split('?')[0]`), anchor the match to the version-prefixed path segment
(e.g. `^/api/v1/(platform|storefront|webhooks|console)/`), and make the fallback
explicit rather than `default: console`.

**Retest Status** — NOT RETESTED.

---

### SEC-004 — Nested order sub-resources return `200 []` for ids that do not exist

| Field | Value |
|---|---|
| **Bug ID** | SEC-004 |
| **Severity** | P3 (no leak — see Actual Result) |
| **Module** | Order / Shipment (`apps/api/src/modules/order/shipment.controller.ts`) |
| **Page** | Console → Orders → order detail |
| **Environment** | As §2 |
| **User** | `owner@lakeside.test` and `owner@northwind.test` |
| **Tenant** | Both directions |
| **Precondition** | None. |

**Steps to Reproduce**

1. `GET /api/v1/console/orders/<other tenant's order id>/shipments`.
2. Repeat with a syntactically valid but nonexistent ULID.
3. Repeat with your own order id.

**Expected Result** — `404` for (1) and (2), consistent with every other by-id route
in the system.

**Actual Result** — all three return `200 {"data":[]}`:

```
LK token, NW real order id       -> 200 {"success":true,"data":[]}
LK token, garbage ULID (control) -> 200 {"success":true,"data":[]}
LK token, own order id           -> 200 {"success":true,"data":[]}
NW token, LK order id            -> 200 {"success":true,"data":[]}
NW token, garbage ULID (control) -> 200 {"success":true,"data":[]}
NW token, own order id           -> 200 {"success":true,"data":[]}
```

**This is not an existence oracle and not a leak.** The responses are byte-identical
across cross-tenant, nonexistent and own-but-empty, so an attacker learns nothing.
It is filed because it deviates from the system's otherwise consistent 404
behaviour, and because a route that cannot distinguish "no such order" from "no
shipments" will mask real bugs in the functional phase.

**Evidence** — above.

**Root Cause** — the handler resolves shipments by order id without first asserting
that the order exists and belongs to the tenant; an unmatched join yields an empty
list rather than a `NotFoundError`.

**Suggested Fix** — resolve the parent order via
`findByPublicIdOrFail` before listing children, as the other nested routes
(`customers/:id/addresses`, which correctly 404s cross-tenant) already do.

**Retest Status** — NOT RETESTED.

---

### SEC-005 — `GET /console/inventory/levels` silently ignores its filter parameters

| Field | Value |
|---|---|
| **Bug ID** | SEC-005 |
| **Severity** | P3 (no leak — data returned is always own-tenant) |
| **Module** | Inventory (`apps/api/src/modules/inventory/inventory.controller.ts`) |
| **Page** | Console → Inventory |
| **Environment** | As §2 |
| **User** | Both owners |
| **Tenant** | Both |
| **Precondition** | None. |

**Steps to Reproduce**

`GET /api/v1/console/inventory/levels?warehouseId=<value>` with, in turn: another
tenant's warehouse id, a garbage ULID, your own warehouse id, and no parameter.

**Expected Result** — a cross-tenant or nonexistent `warehouseId` should 404 (as the
`productId` variant of the same endpoint correctly does); a valid own id should
filter.

**Actual Result** — the parameter is ignored in all four cases:

```
LK token, NW warehouseId      -> 200 n=1 warehouses=["01M1YEJHJW8C83CE2E8716Y501:Main warehouse"]
LK token, garbage warehouseId -> 200 n=1 warehouses=["01M1YEJHJW8C83CE2E8716Y501:Main warehouse"]
LK token, own warehouseId     -> 200 n=1 warehouses=["01M1YEJHJW8C83CE2E8716Y501:Main warehouse"]
LK token, no filter           -> 200 n=1 warehouses=["01M1YEJHJW8C83CE2E8716Y501:Main warehouse"]
NW token, LK warehouseId      -> 200 n=0
NW token, own warehouseId     -> 200 n=0
```

The rows returned to lakeside are lakeside's own (`01M1YEJHJW8C83…` is lakeside's
`MAIN`), so **there is no cross-tenant exposure** — the tenant scope holds and only
the caller's filter is dropped. Two separate defects are visible: the
`warehouseId` filter is not applied, and northwind gets `n=0` where
`GET /console/inventory/low-stock` for the same tenant does return rows.

Filed here because it was flagged during isolation testing; it belongs to the
functional/API phase, not to security.

**Evidence** — above. Contrast: `levels?productId=<other tenant's product>`
correctly returns `404 RESOURCE_NOT_FOUND`.

**Root Cause** — not diagnosed (out of scope for this phase); the query parameter
is evidently not reaching the repository predicate.

**Suggested Fix** — apply `warehouseId` to the query and 404 on an unresolvable id,
matching the `productId` path.

**Retest Status** — NOT RETESTED.

---

## 4. Full test evidence

### 4.1 A1 — Curated cross-tenant resource matrix (81 cases)

Every case: take a **real** id belonging to tenant X, send the request with tenant
Y's owner token. Both directions were run. Expected result is `404` throughout.

**Products** — 10/10 PASS

| Actor | Method / path | Result | Verdict |
|---|---|---|---|
| lakeside | `GET /console/products/<nw real>` | 404 `RESOURCE_NOT_FOUND` | PASS |
| lakeside | `PUT /console/products/<nw sac A>` `{name:"PWNED-BY-LAKESIDE"}` | 404 | PASS |
| lakeside | `POST /console/products/<nw sac B>/publish` | 404 | PASS |
| lakeside | `DELETE /console/products/<nw sac B>` | 404 | PASS |
| lakeside | `POST /console/products` with **nw `storeId` in body** | 404 | PASS |
| northwind | `GET /console/products/<lk>` | 404 | PASS |
| northwind | `PUT /console/products/<lk>` `{name:"PWNED-BY-NORTHWIND"}` | 404 | PASS |
| northwind | `POST /console/products/<lk>/publish` | 404 | PASS |
| northwind | `DELETE /console/products/<lk>` | 404 | PASS |
| both | search with the other tenant's product name (`?search=Northwind`, `?search=QA-Lakeside`) | own-tenant rows only | PASS |

The body-field case matters: `POST /console/products` with another tenant's
`storeId` is rejected because `ProductRepository.resolveId()` scopes its lookup
(`WHERE public_id = ? AND tenant_id = ?`).

**Orders** — 13/14 PASS, 1 SEC-004

| Actor | Method / path | Result | Verdict |
|---|---|---|---|
| lakeside | `GET /console/orders/<nw ORD-000004>` | 404 | PASS |
| lakeside | `POST /console/orders/<nw sac A>/cancel` | 404 | PASS |
| lakeside | `POST /console/orders/<nw sac B>/hold` | 404 | PASS |
| lakeside | `POST /console/orders/<nw sac B>/resume` | 404 | PASS |
| lakeside | `POST /console/orders/<nw sac B>/fulfil` | 422 (schema: `items` required) | PASS* |
| lakeside | `POST /console/orders/<nw sac B>/close` | 404 | PASS |
| lakeside | `POST /console/orders/<nw sac A>/refund` | 404 | PASS |
| lakeside | `POST /console/orders/<nw sac A>/returns` | 422 (schema: `reason` enum) | PASS* |
| lakeside | `GET /console/orders/<nw>/shipments` | **200 `[]`** | **SEC-004** |
| northwind | `GET /console/orders/<lk ORD-000001>` | 404 | PASS |
| northwind | `POST /console/orders/<lk>/cancel` | 404 | PASS |
| northwind | `POST /console/orders/<lk>/hold` | 404 | PASS |
| northwind | `POST /console/orders/<lk>/fulfil` | 422 (schema) | PASS* |
| northwind | `POST /console/orders/<lk>/close` | 404 | PASS |

**Customers (incl. nested addresses / wishlist / loyalty)** — 16/16 PASS

| Actor | Method / path | Result |
|---|---|---|
| lakeside | `GET /console/customers/<nw real>` | 404 |
| lakeside | `PUT /console/customers/<nw sac>` `{firstName:"PWNED"}` | 404 |
| lakeside | `GET /console/customers/<nw>/addresses` | 404 |
| lakeside | `POST /console/customers/<nw sac>/addresses` | 404 |
| lakeside | `PUT /console/customers/<nw sac>/addresses/<nw addr>` | 404 |
| lakeside | `DELETE /console/customers/<nw sac>/addresses/<nw addr>` | 404 |
| lakeside | `GET /console/customers/<nw>/wishlist` | 404 |
| lakeside | `POST /console/customers/<nw sac>/wishlist` | 404 |
| lakeside | `DELETE /console/customers/<nw sac>/wishlist/<nw product>` | 409 `Product '…' not found` (PASS*) |
| lakeside | `GET /console/customers/<nw>/loyalty` | 404 |
| lakeside | `POST /console/customers/<nw sac>/loyalty/adjust` | 422 (schema) — PASS* |
| northwind | `GET /console/customers/<lk>` | 404 |
| northwind | `PUT /console/customers/<lk>` | 404 |
| northwind | `GET /console/customers/<lk>/addresses` | 404 |
| northwind | `DELETE /console/customers/<lk>/addresses/<lk addr>` | 404 |
| northwind | `GET /console/customers/<lk>/wishlist` | 404 |

**Inventory** — 11/12 PASS, 1 SEC-005

| Actor | Request | Result |
|---|---|---|
| lakeside | `GET levels?productId=<nw>` | 404 |
| lakeside | `GET levels?warehouseId=<nw>` | 200, **own-tenant rows** → SEC-005 (not a leak) |
| lakeside | `GET movements/<nw product>` | 404 |
| lakeside | `POST adjust` nw warehouse + nw product, `quantityDelta:-999` | 404 |
| lakeside | `POST adjust` **nw warehouse + lk product** (mixed) | 404 |
| lakeside | `POST adjust` **lk warehouse + nw product** (mixed) | 404 |
| lakeside | `POST transfer` lk warehouse → **nw warehouse** | 404 |
| lakeside | `POST transfer` **nw warehouse** → lk warehouse | 404 |
| lakeside | `GET low-stock` | 200, own tenant (empty) |
| northwind | `GET levels?productId=<lk>` | 404 |
| northwind | `GET movements/<lk product>` | 404 |
| northwind | `POST adjust` lk warehouse + lk product | 404 |

Both *mixed* cases are the interesting ones — one own-tenant id and one foreign id
in the same body — and both were refused.

**Coupons** — 9/9 PASS. Includes the existence-probe the mandate called out:

| Actor | Request | Response body |
|---|---|---|
| lakeside | `POST /console/coupons/validate` `{code:"FREESHIP"}` (nw's real code) | `{"valid":false,"reason":"Coupon 'FREESHIP' is not valid"}` |
| lakeside | `POST …/validate` `{code:"QA-NW-SAC10"}` (nw's code) | `{"valid":false,"reason":"Coupon 'QA-NW-SAC10' is not valid"}` |
| lakeside | `POST …/validate` `{code:"QA-DEFINITELY-NOT-A-CODE"}` (control) | `{"valid":false,"reason":"Coupon 'QA-DEFINITELY-NOT-A-CODE' is not valid"}` |
| lakeside | `POST …/validate` `{code:"QA-LK-PROBE10"}` (own) | `{"valid":true,"discountMinor":"1000000"}` |
| northwind | `POST …/validate` `{code:"QA-LK-PROBE10"}` (lk's code) | `{"valid":false,"reason":"Coupon 'QA-LK-PROBE10' is not valid"}` |
| northwind | `POST …/validate` `{code:"QA-NOPE-NOT-REAL"}` (control) | `{"valid":false,"reason":"Coupon 'QA-NOPE-NOT-REAL' is not valid"}` |

A foreign coupon code is indistinguishable from a nonexistent one — **no
existence leak**. `GET/PUT/DELETE /console/coupons/:id` cross-tenant: 404 in both
directions.

**Reviews** — 8/8 PASS. `GET`, `POST :id/moderate`, `POST :id/reply` and
`DELETE :id` all 404 in both directions. Verified afterwards that the sacrificial
northwind reviews were untouched (`status=PENDING`, `merchantReply=null`,
review B still exists) and lakeside's review likewise.

**Warehouses / Stores** — 4/4 PASS. `GET /console/warehouses/:id` and
`GET /console/stores/:id` 404 in both directions.

**Adjacent surfaces** — `GET /console/media/products/<nw product>` → 404;
`GET /console/theme/store/<nw store>` → 409 (PASS*).

**Storefront cart cross-tenant** — 4/4 PASS.
Creating a cart under lakeside's host with **northwind's `storeId`** →
`409 "Store '01M1W1MAYS…' not found"`; the reverse likewise. Adding a northwind
product to a lakeside cart and applying a northwind coupon code to a lakeside cart
were both refused.

**PASS\* (10 cases)** means the request was rejected *before* reaching the
isolation check — by schema validation (422) or a conflict (409) — so it does not
positively prove the isolation predicate on that path. It is recorded as PASS
because no cross-tenant data was returned or written, but it is weaker evidence
than a 404 and is called out rather than folded into the PASS count silently.

### 4.2 A2 — Mutation-verification probes (29 cases, all PASS)

After the destructive matrix, every targeted resource was re-read with its **own**
tenant's token to prove nothing actually changed:

```
NW sac productA   name= QA-Northwind Sacrificial Probe A  status= ACTIVE     (PUT "PWNED" did not land)
NW sac productB   name= QA-Northwind Sacrificial Probe B  status= ACTIVE     (still exists: DELETE blocked)
NW sac coupon     code= QA-NW-SAC10  value= 10.0000  status= ACTIVE          (PUT 99 did not land; not deleted)
NW sac customer   firstName= QA                                              (PUT "PWNED" did not land)
NW sac reviewA    status= PENDING  reply= null                               (moderate/reply blocked)
NW sac reviewB    200                                                        (still exists: DELETE blocked)
NW sac orderA     CONFIRMED / PENDING                                        (cancel + refund blocked)
NW sac orderB     CONFIRMED / UNFULFILLED                                    (hold/resume/fulfil/close blocked)
NW sac addresses  ["QA NW Sac"]                                              (PUT/DELETE blocked)
NW sac productA   stock= [18]                                                (-999 adjust blocked)
LK product        QA-Lakeside Isolation Probe Widget                         (unchanged)
LK review         status= PENDING  reply= null                               (unchanged)
LK order          CONFIRMED                                                  (unchanged)
LK coupon         10.0000  ACTIVE                                            (unchanged)
LK customer       QA                                                         (unchanged)
```

### 4.3 A3 — Platform-global allowlisted entities (30 cases)

The allowlist (`PLATFORM_GLOBAL_ENTITIES`) is the one place where all three
isolation layers are off, so every entry with a reachable tenant-facing API was
probed. This is where SEC-001 was found; everything else held.

| Entity | Surface probed | Result | Verdict |
|---|---|---|---|
| `SupportTicketEntity`, `SupportTicketMessageEntity` | `console/support-tickets` (list, get, messages get/post, assign, resolve, close) | list/get/messages **leak both ways**; `assign`/`resolve`/`close` correctly `403` (`platform.support:*`) | **FAIL — SEC-001** |
| `ProductShareEntity` | `console/marketplace/shares`, `/catalog`, `/resellers` | 200, own tenant only (empty for both) | PASS |
| `CommissionLedgerEntity` | `console/commission/ledger`, `console/settlements` | 200, own tenant only (empty for both) | PASS |
| `PlanEntity`, `PlanLimitEntity` | `GET /plans` | 200 shared catalogue — correct by design | PASS |
| `ThemeTemplateEntity` | `console/theme/gallery` | 200, 9 shared templates — correct by design | PASS |
| `UserRoleEntity` | `console/invitations` | own tenant only (nw 11, lk 0) | PASS |
| `AuditLogEntity` | `console/auditlog`, `console/audit-logs`, `platform/audit-logs`, `console/logs` | all `404 Cannot GET` — no route exists | NOT IMPLEMENTED |
| `TenantEntity` | `platform/tenants/:id/export` from a tenant token | `403 PERMISSION_DENIED (platform.tenant:export)` | PASS |

Marketplace **dual-tenant sharing** — the one allowlisted area whose comment
claims "authorization is explicit in the marketplace services instead" — is
**BLOCKED**: creating a share requires the reseller tenant to have an active
marketplace-reseller store, and no console route can create one
(`console/stores` is GET-only; `POST /console/marketplace/shares` returns
`VALIDATION_FAILED: Tenant '01M1VYDREC…' has no active marketplace-reseller
store`). The read surfaces above were tested and are correctly scoped, but the
share/accept/revoke authorization path is untested here and should be covered
once a reseller store can be provisioned.

Also verified, and worth recording as a positive: the **platform super admin
cannot read tenant data**. `admin@ems.test` holds only `platform.*` codes, so
`GET /console/products`, `GET /console/orders` and
`GET /console/products/<nw id>` all return `403 PERMISSION_DENIED`. Cross-tenant
access from the platform surface is a deliberate, separately-permissioned act
rather than ambient super-user reach.

Repository audit — every repository not extending `TenantScopedRepository` was
read to check whether it applies a tenant predicate by hand:

| Plain repository | Tenant predicate present? |
|---|---|
| `cart/cart-product-lookup.repository.ts` | Yes — `requireTenantId()` + `AND tenant_id = ?` on every query |
| `seo/seo-settings.repository.ts` | Yes — same pattern |
| `marketplace/product-share.repository.ts` | Yes — explicit supplier/reseller checks (`findForEitherSideOrFail`) |
| `marketplace/commission-ledger.repository.ts` | Partial — `beneficiaryTenantId` filters on the list paths |
| `theme/theme-template.repository.ts` | N/A — platform catalogue by design |
| `support/support-ticket.repository.ts` | **No** → SEC-001 |
| `support/support-ticket-message.repository.ts` | **No** → SEC-001 |

### 4.4 A4 — Storefront and tenant resolution (40 cases)

This section answers the two questions the mandate raised specifically.

**(a) Does the unresolved-tenant storefront fallback ever serve real tenant data?
No.**

The Phase 2 observation was correct — bare `localhost:3001` does return HTTP 200
with a generic "Store" title — but it is backed by nothing:

| Host | HTTP | Bytes | Northwind data present? | Lakeside data present? | Title |
|---|---|---|---|---|---|
| `localhost:3001/` | 200 | 51,232 | **no** | **no** | `Store` |
| `localhost:3001/products` | 200 | 69,469 | **no** | **no** | `All products · Store` |
| `127.0.0.1:3001/products` | 200 | 69,445 | **no** | **no** | `All products · Store` |
| `unknown.ems.localhost:3001/` | 200 | 51,368 | **no** | **no** | `Unknown` |
| `northwind.ems.localhost:3001/products` | 200 | 258,822 | yes | no | `All products · Northwind Main Store` |
| `lakeside.ems.localhost:3001/products` | 200 | 78,814 | no | yes | `All products · Lakeside Supply Co` |

The fallback page renders an empty product list, because the API it calls fails
closed. Every storefront route was probed with no tenant signal at all and every
one returned `400 TENANT_CONTEXT_MISSING` rather than unscoped data:

```
GET  /storefront/products                  -> 400 TENANT_CONTEXT_MISSING (ProductEntity query)
GET  /storefront/products/<nw slug>        -> 400 TENANT_CONTEXT_MISSING
GET  /storefront/products/<lk slug>        -> 400 TENANT_CONTEXT_MISSING
GET  /storefront/products/<nw id>/reviews  -> 400 TENANT_CONTEXT_MISSING
GET  /storefront/theme                     -> 400 TENANT_CONTEXT_MISSING (TenantThemeEntity query)
GET  /storefront/banners                   -> 400 TENANT_CONTEXT_MISSING (BannerEntity query)
GET  /storefront/sitemap.xml               -> 400 TENANT_CONTEXT_MISSING (SEO settings)
GET  /storefront/robots.txt                -> 400 TENANT_CONTEXT_MISSING (SEO settings)
POST /storefront/cart (no storeId)         -> 409 storeId is required
POST /storefront/cart?storeId=<nw>         -> 400 TENANT_CONTEXT_MISSING (cart product lookup)
POST /storefront/cart?storeId=<lk>         -> 400 TENANT_CONTEXT_MISSING (cart product lookup)
POST /storefront/reviews (nw productId)    -> 400 TENANT_CONTEXT_MISSING
```

`RequestContextService.requireTenantId()` throwing is the property that makes this
safe: there is no code path that treats "no tenant" as "all tenants". Note the
cart cases in particular — supplying a *valid* store public id with no host still
fails, so the store id alone cannot bootstrap a tenant context.

Minor observation (not filed as a bug): `unknown.ems.localhost:3001` renders the
subdomain label back as the store name ("Unknown"). React escapes the value and no
data is exposed, but reflecting an unvalidated hostname as the store's display
name is worth a look in the frontend phase.

**(b) Can the `x-ems-hostname` fallback be tricked into serving one tenant under
another's identity? No.**

The header was added in commit `8590a88` ("feat(storefront): build real storefront
(catalogue, cart, checkout)") and is committed, not a working-tree change. It was
attacked directly against the API, bypassing the Next.js middleware that normally
sets it:

| `x-ems-hostname` | Result | Verdict |
|---|---|---|
| `northwind.ems.localhost` | 200, northwind catalogue | as designed |
| `NORTHWIND.EMS.LOCALHOST` | 200, northwind catalogue (case-normalised) | as designed |
| `northwind.ems.localhost:9999` | 200, northwind catalogue (port stripped) | as designed |
| `  northwind.ems.localhost  ` | 200, northwind catalogue (trimmed) | as designed |
| `nonexistent.ems.localhost` | **400 TENANT_CONTEXT_MISSING** | PASS |
| `localhost` | **400 TENANT_CONTEXT_MISSING** | PASS |
| `""` (empty) | **400 TENANT_CONTEXT_MISSING** | PASS |
| `northwind.ems.localhost, lakeside.ems.localhost` | **400 TENANT_CONTEXT_MISSING** | PASS |
| `northwind.ems.localhost' OR '1'='1` | **400 TENANT_CONTEXT_MISSING** | PASS (parameterised query) |

The header can only ever select a hostname that already exists in
`tenant_domains`, i.e. exactly the choice any anonymous shopper makes by typing a
different URL, and the data it reaches is the public catalogue. It confers no
access the tenant's own hostname does not already confer. The one open question —
whether an *unverified* domain also resolves — is SEC-002, blocked.

Combined with a token, the header is powerless:

```
LK token, no header                          -> 200 n=1 ["QA-Lakeside Isolation Probe Widget"]
LK token, x-ems-hostname: northwind…         -> 200 n=1 ["QA-Lakeside Isolation Probe Widget"]
LK token, Host: northwind…                   -> 200 n=1 ["QA-Lakeside Isolation Probe Widget"]
LK token + forged host, GET /console/products/<nw id> -> 404 RESOURCE_NOT_FOUND
```

`JwtAuthGuard` patches the tenant context from the verified `tid` claim after the
middleware has run, so the header cannot override it. (`Host` itself is a
forbidden header that `fetch` will not send, which independently confirms the
middleware comment's reasoning.) Cross-tenant cart writes were also refused:
forged northwind host + lakeside `storeId` → `409 Store not found`, and the
reverse likewise.

Surface spoofing via the query string is SEC-003 — the classification is
attacker-controlled but fails closed.

### 4.5 A5 — Systematic list-endpoint sweep (44 endpoints)

A curated by-id matrix can only test the routes you thought of; SEC-001 was
originally spotted by accident in an own-tenant control. So every console
list/collection endpoint was fetched as **both** tenant owners and the two result
sets diffed for shared identifiers (`id`, `publicId`, `ticketNumber`,
`orderNumber`, `code`, `hostname`, `sku`, `slug`).

**Result: 40 of 44 fully isolated (0 shared identifiers). 4 with shared values,
of which 3 are benign and 1 is SEC-001.**

| Endpoint | Shared values | Assessment |
|---|---|---|
| `/console/support-tickets` | 6 — `id=01M1YGX75AVMRZ5ZN06ZPWT5N0`, `ticketNumber=TKT-MTRK0LGO`, `id=01M1W4S6HA7T8D2YDN7T5MNVKY`, `ticketNumber=TKT-MTQ8HP9L`, `id=01M1W51VD81RR6HNXPNMWG2JMW`, `ticketNumber=TKT-MTQ8NS13` | **REAL LEAK → SEC-001** |
| `/console/orders?limit=100` | 1 — `orderNumber=ORD-000001` | Benign: order numbers are per-tenant sequences, so both tenants legitimately have an `ORD-000001`. The public ids differ; no row is shared. |
| `/console/warehouses` | 1 — `code=MAIN` | Benign: both tenants' provisioning creates a warehouse coded `MAIN`. Public ids differ. |
| `/console/theme/gallery` | 9 — `code=electronics`, `fashion`, `furniture`, `general`, `grocery`, `handmade`, `jewelry`, `pharmacy`, `restaurant` | Benign and intended: `ThemeTemplateEntity` is the platform's shared gallery. |

Endpoints confirmed isolated (0 shared): `products`, `products/attributes`,
`customers`, `coupons`, `reviews`, `stores`, `inventory/low-stock`,
`inventory/levels`, `brands`, `categories`, `categories/tree`, `banners`,
`cms/pages`, `blog/posts`, `gift-cards`, `tax/classes`, `tax/rates`, `domains`,
`invitations`, `notifications`, `notification-templates`, `returns`,
`settlements`, `commission/ledger`, `marketplace/shares`, `marketplace/catalog`,
`marketplace/resellers`, `seo/settings`, `channels`, `reports/sales-summary`,
`analytics/funnel`, `analytics/search-queries`, `subscription`,
`subscription/usage`, `billing/invoices`, `billing/gateways`,
`media/products/:id`, `menus/:code`, `shipments/sync-tracking`, `auth/sessions`.

Session isolation is worth pulling out: `GET /auth/sessions` returned 54 distinct
identifiers for northwind and 19 for lakeside with **0** overlap, and northwind
attempting to revoke a lakeside session by id returned
`404 Session '01M1YGWY1KJXA8D6BTEXZ9RF4J' not found`.

---

## 5. Assessment

The isolation architecture works. Three layers —
`TenantScopedRepository` injecting the predicate, `TenantGuardSubscriber` stamping
and blocking at the ORM level, and `tenant-coverage.spec.ts` failing the build for
an unclassified entity — produced 211 passes out of 224, including every
destructive cross-tenant mutation attempt against all eight mandated resource
types, in both directions, and including the harder cases (foreign id in a body
field, foreign id in a query parameter, mixed own/foreign ids in one request,
foreign coupon code as an existence oracle). The 404-not-403 rule holds
universally: **zero** existence leaks were found.

The one failure is the exception that proves the rule. Every layer of that
architecture is opt-in via `@TenantScoped()`, so a single line on the
`PLATFORM_GLOBAL_ENTITIES` allowlist switches all three off at once — including
the CI gate that exists precisely to catch un-scoped tenant data. Support tickets
were put on that list with a reasoned comment, and the compensating control the
comment promises ("an explicit `requesterUserId`/`tenantId` filter here") was then
implemented as a *client-supplied, default-off* query flag rather than as an
enforced check. That is the whole bug.

The generalisable lesson for the fix phase: the allowlist mixes two different
things. Platform-owned reference data (`PlanEntity`, `ThemeTemplateEntity`,
`AcmeAccountEntity`) is genuinely shared and safe. Tenant-owned data that platform
staff *also* administer (`SupportTicketEntity` — which has a real, populated
`tenant_id` column) is not, and the codebase already has the right tool for it:
`@TenantScoped()` plus an explicit `runWithoutTenant()` in the handful of
platform-only methods, which — as `TenantScopedRepository`'s own comment argues —
makes turning isolation off "visible in a diff, not a boolean flag someone flips".
Any other allowlist entry with a non-null `tenant_id` column deserves the same
scrutiny.

---

## 6. Status ledger

| Area | Status |
|---|---|
| Products / Orders / Customers / Inventory / Coupons / Reviews / Warehouses / Stores — cross-tenant read | **PASS** |
| Same — cross-tenant write / delete / state transitions | **PASS** |
| Cross-tenant ids in body fields and query parameters | **PASS** |
| Coupon-code existence oracle | **PASS** |
| Nested sub-resources (addresses, wishlist, loyalty, shipments, returns) | **PASS** (except SEC-004, no leak) |
| Storefront cart / checkout cross-tenant | **PASS** |
| Unresolved-tenant storefront fallback | **PASS** — no real data behind it |
| Forged `x-ems-hostname` direct to the API | **PASS** — confined to real registered hostnames |
| Console `tid` override via headers | **PASS** |
| Platform routes from a tenant token | **PASS** |
| Tenant data from a platform token | **PASS** (403, no ambient reach) |
| Session isolation / cross-tenant revocation | **PASS** |
| Systematic 44-endpoint list sweep | **PASS** 43/44 |
| **Support tickets (read + write)** | **FIXED 2026-09-08 — retested PASS** (was FAIL — SEC-001, P0) |
| Unverified-domain resolution | **NOT TESTED** — SEC-002, blocked on queue Redis |
| Marketplace share/accept/revoke authorization | **BLOCKED** — no API to provision a reseller store |
| Audit-log console surface | **NOT IMPLEMENTED** — no route exists |

---

## 7. QA data left in the system

Created via the real API, all `QA-*` prefixed and safe to delete:

- **lakeside**: store `Lakeside Supply Co`, warehouse `MAIN`, product
  `QA-Lakeside Isolation Probe Widget`, customer `qa-lakeside-probe@qa.test`
  (+address, +wishlist entry), coupon `QA-LK-PROBE10`, one review, order
  `ORD-000001`, domain rows as listed.
- **northwind**: `QA-Northwind Sacrificial Probe A`/`B`, coupon `QA-NW-SAC10`,
  customer `qa-nw-sacrificial@qa.test` (+address), 2 reviews, orders
  `ORD-000005`/`ORD-000006`, plus per-role RBAC victim products/coupons/reviews/orders
  from Part B, and 7 staff accounts `qa-*@qa.test` (see `PERMISSION_MATRIX.md` §2).
- **Not QA data — needs cleanup**: northwind ticket
  `01M1W4S6HA7T8D2YDN7T5MNVKY` status and message id 3. See §2.3.

Environment note: a minimal SMTP sink was run on `127.0.0.1:1025` (the port the
API's nodemailer is already configured for, never previously started) to capture
invitation tokens for Part B. No application code, configuration or database row
was modified to enable it.
