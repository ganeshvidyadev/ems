# EMS — Permission Matrix (QA Phase 6, Part B: RBAC)

**Phase:** 6 — Security (P0 release gate)
**Executed:** 2026-09-07, live against the running dev stack
**Scope:** Role-based authorization across the 12 seeded roles, plus JWT
verification. Tenant-isolation results are in `SECURITY_REPORT.md`.
**Method:** Every cell is a real HTTP request carrying that role's real access
token, sent directly to `http://localhost:4000/api/v1` — the UI was bypassed
entirely. UI behaviour is reported separately in §6 and is never treated as
evidence of backend enforcement.

---

## 0. Verdict

> **RBAC is HOLDING.** 410 role×action cells executed, **410 correct**, 0 failures.

151 cells expected to be allowed were allowed; 259 cells expected to be denied
returned `403 PERMISSION_DENIED` — every single one, including every destructive
and financial action tested. There were **zero** mismatches between what
`roles.seed.ts` says a role should hold and what the issued token actually held,
so the seed → database → token → guard chain is consistent end to end.

JWT verification is real, not skipped: **19 of 19** malformed, tampered, expired
and signature-stripped tokens were rejected with `401`, including payloads with
`tid` rewritten to another tenant, `perms` rewritten to `["*"]`, and `alg` set to
`none`.

Two findings are raised, neither of them an authorization bypass:

- **RBAC-001 (P2)** — a `STORE_ADMIN` can invite a new `STORE_OWNER`, which
  defeats the seed's deliberate withholding of billing rights from Store Admin.
  In-tenant vertical privilege escalation.
- **RBAC-002 (P3)** — the console renders `403` responses as empty states ("No
  coupons match these filters", "No store on this account yet") instead of a
  permission message. Not a security hole; the API blocks correctly. A usability
  and supportability problem.

---

## 1. Role coverage — 10 of 12 roles tested with real credentials

| # | Role | Scope | Credentials | Source | Status |
|---|---|---|---|---|---|
| 1 | `PLATFORM_SUPER_ADMIN` | PLATFORM | `admin@ems.test` | seeded | **TESTED** |
| 2 | `PLATFORM_SUPPORT` | PLATFORM | — | none exists | **NOT TESTED** (§5) |
| 3 | `PLATFORM_BILLING` | PLATFORM | — | none exists | **NOT TESTED** (§5) |
| 4 | `STORE_OWNER` | TENANT | `owner@northwind.test` | seeded | **TESTED** |
| 5 | `STORE_ADMIN` | TENANT | `qa-store-admin@qa.test` | created this phase | **TESTED** |
| 6 | `PRODUCT_MANAGER` | TENANT | `qa-product-manager@qa.test` | created this phase | **TESTED** |
| 7 | `ORDER_MANAGER` | TENANT | `ops@northwind.test` | seeded | **TESTED** |
| 8 | `INVENTORY_MANAGER` | TENANT | `qa-inventory-manager@qa.test` | created this phase | **TESTED** |
| 9 | `MARKETING_MANAGER` | TENANT | `qa-marketing-manager@qa.test` | created this phase | **TESTED** |
| 10 | `CUSTOMER_SUPPORT` | TENANT | `qa-customer-support@qa.test` | created this phase | **TESTED** |
| 11 | `SUPPLIER` | TENANT | `qa-supplier@qa.test` | created this phase | **TESTED** |
| 12 | `RESELLER` | TENANT | `qa-reseller@qa.test` | created this phase | **TESTED** |

`ops@lakeside.test` (`PRODUCT_MANAGER`, tenant lakeside) also logs in and was used
for isolation testing; the northwind `PRODUCT_MANAGER` account was created so all
roles sit in one tenant against one comparable data set.

### 1.1 How the seven new accounts were created

Through the **real invitation flow** — no direct database writes, no code changes:

1. `POST /console/invitations` as `owner@northwind.test` with the target
   `roleCodes` → `201`, invitation row created, token minted and mailed.
2. The invitation token is hashed in the database and never returned in the API
   response, so it had to come from the email. The project's configured SMTP
   endpoint (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025` — MailHog's default, which
   `QA_REPORT.md` §5 records as never started) was pointed at a minimal SMTP sink
   run for the duration of the phase. This is environment provisioning: nothing in
   the application, its configuration, or the database was modified to enable it.
3. `GET /invitations/preview?token=…` → `200`, confirming role and tenant.
4. `POST /invitations/accept` → `201`, account created by the real service.
5. `POST /auth/login` → `200`, verifying the account works and the role took.

Every step returned the expected status for all seven roles. Password for all
seven: `QaPhase6Pass!234`.

### 1.2 Seeded grants match the database exactly

Grant counts read directly from `role_permissions`, cross-checked against the
permission count in each issued token:

| Role | Scope | DB grants | Token `perms` | Match |
|---|---|---|---|---|
| `PLATFORM_SUPER_ADMIN` | PLATFORM | 45 | 45 | yes |
| `PLATFORM_BILLING` | PLATFORM | 14 | *(no account)* | — |
| `PLATFORM_SUPPORT` | PLATFORM | 9 | *(no account)* | — |
| `STORE_OWNER` | TENANT | 160 | 160 | yes |
| `STORE_ADMIN` | TENANT | 152 | 152 | yes |
| `RESELLER` | TENANT | 50 | 50 | yes |
| `MARKETING_MANAGER` | TENANT | 47 | 47 | yes |
| `SUPPLIER` | TENANT | 35 | 35 | yes |
| `PRODUCT_MANAGER` | TENANT | 29 | 29 | yes |
| `ORDER_MANAGER` | TENANT | 22 | 22 | yes |
| `CUSTOMER_SUPPORT` | TENANT | 18 | 18 | yes |
| `INVENTORY_MANAGER` | TENANT | 16 | 16 | yes |

Note that `STORE_OWNER`'s `['*']` resolves to 160 **TENANT-scoped** permissions and
zero platform ones, and `PLATFORM_SUPER_ADMIN`'s `['platform.*']` resolves to 45
platform permissions and zero tenant ones. The scope firewall in
`resolvePermissions()` ("A PLATFORM permission must never end up on a TENANT role")
is doing its job — confirmed behaviourally in §3, where the super admin is denied
tenant data and every tenant role is denied platform routes.

---

## 2. The matrix

**41 actions × 10 roles = 410 cells.** Expected outcome for each cell was derived
from the permission patterns in
`apps/api/src/database/seeds/roles.seed.ts` (`ROLE_SPECS`) — the documented
intent — using the same glob semantics the seed itself uses, **not** from the
token's own permission list. That matters: deriving expectations from the token
would make the test circular and would hide a wrongly-seeded grant.

Legend: `A nnn` = expected **A**llowed, guard permitted, HTTP status `nnn`.
`D 403` = expected **D**enied, guard returned `403 PERMISSION_DENIED`.
Every cell below is correct; a wrong cell would read `A 403` or `D 2xx`.

Columns: OWN = Store Owner · ADM = Store Admin · PRD = Product Manager ·
ORD = Order Manager · INV = Inventory Manager · MKT = Marketing Manager ·
SUP = Customer Support · SPL = Supplier · RSL = Reseller ·
PSA = Platform Super Admin.

| Action (required permission) | OWN | ADM | PRD | ORD | INV | MKT | SUP | SPL | RSL | PSA |
|---|---|---|---|---|---|---|---|---|---|---|
| `product:read` | A 200 | A 200 | A 200 | A 200 | A 200 | A 200 | A 200 | A 200 | A 200 | D 403 |
| `product:create` | A 201 | A 201 | A 201 | D 403 | D 403 | D 403 | D 403 | A 201 | D 403 | D 403 |
| `product:update` | A 200 | A 200 | A 200 | D 403 | A 200 | D 403 | D 403 | A 200 | D 403 | D 403 |
| `product:publish` | A 200 | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | A 200 | D 403 | D 403 |
| `product:delete` **†** | A 404 | A 204 | A 204 | D 403 | D 403 | D 403 | D 403 | A 204 | D 403 | D 403 |
| `order:read` | A 200 | A 200 | D 403 | A 200 | A 200 | D 403 | A 200 | A 200 | A 200 | D 403 |
| `order:update` (hold) | A 201 | A 201 | D 403 | A 201 | D 403 | D 403 | D 403 | D 403 | A 201 | D 403 |
| `order:cancel` **†** | A 201 | A 201 | D 403 | A 201 | D 403 | D 403 | A 201 | D 403 | D 403 | D 403 |
| `order:refund` **$** | A 404 | A 404 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `payment:reconcile` **$** | A 201 | A 201 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `coupon:read` | A 200 | A 200 | D 403 | D 403 | D 403 | A 200 | D 403 | D 403 | A 200 | D 403 |
| `coupon:create` | A 201 | A 201 | D 403 | D 403 | D 403 | A 201 | D 403 | D 403 | A 201 | D 403 |
| `coupon:delete` **†** | A 204 | A 204 | D 403 | D 403 | D 403 | A 204 | D 403 | D 403 | A 204 | D 403 |
| `customer:read` | A 200 | A 200 | D 403 | A 200 | D 403 | A 200 | A 200 | D 403 | A 200 | D 403 |
| `customer:update` | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | A 200 | D 403 | A 200 | D 403 |
| `review:read` | A 200 | A 200 | A 200 | D 403 | D 403 | A 200 | A 200 | D 403 | D 403 | D 403 |
| `review:moderate` | A 201 | A 201 | A 201 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `review:reply` | A 201 | A 201 | A 201 | D 403 | D 403 | A 201 | A 201 | D 403 | D 403 | D 403 |
| `review:delete` **†** | A 204 | A 204 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `inventory:read` | A 200 | A 200 | A 200 | A 200 | A 200 | D 403 | A 200 | A 200 | D 403 | D 403 |
| `inventory:adjust` | A 201 | A 201 | A 201 | D 403 | A 201 | D 403 | D 403 | A 201 | D 403 | D 403 |
| `warehouse:read` | A 200 | A 200 | D 403 | D 403 | A 200 | D 403 | D 403 | A 200 | D 403 | D 403 |
| `store:read` | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `user:read` | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `user:invite` **^** | A 201 | A 201 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `tax:read` | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `tax:update` | A 201 | A 201 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `report:read` | A 422 | A 422 | A 422 | A 422 | A 422 | A 422 | D 403 | A 422 | A 422 | D 403 |
| `banner:create` | A 201 | A 201 | D 403 | D 403 | D 403 | A 201 | D 403 | D 403 | A 201 | D 403 |
| `giftcard:create` | A 422 | A 422 | D 403 | D 403 | D 403 | A 422 | D 403 | D 403 | D 403 | D 403 |
| `theme:read` | A 200 | A 200 | D 403 | D 403 | D 403 | A 200 | D 403 | D 403 | A 200 | D 403 |
| `theme:publish` | A 404 | A 404 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | A 404 | D 403 |
| `subscription:read` **$** | A 404 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `subscription:upgrade` **$** | A 404 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `marketplace:share` | A 422 | A 422 | D 403 | D 403 | D 403 | D 403 | D 403 | A 422 | D 403 | D 403 |
| `settlement:read` **$** | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | D 403 | A 200 | A 200 | D 403 |
| `commission:read` **$** | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | D 403 | A 200 | A 200 | D 403 |
| `domain:read` | A 200 | A 200 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 |
| `loyalty:read` | A 200 | A 200 | D 403 | D 403 | D 403 | A 200 | A 200 | D 403 | D 403 | D 403 |
| `platform.settlement:read` | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | A 200 |
| `platform.tenant:export` | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | D 403 | A 0 ‡ |

**†** destructive · **$** financial · **^** privilege-escalation-relevant

Non-2xx statuses in `A` cells are the point being measured and are correct
results, not failures — the guard **allowed** the request and it then met normal
business logic. Specifically: `A 404` on `order:refund` is a COD order with no
captured payment to refund; `A 404` on `theme:publish` is a deliberate
placeholder theme id; `A 404` on `subscription:read`/`upgrade` is northwind having
no subscription row; `A 422` is schema validation on a probe body (`report:read`
requires a date range, `giftcard:create` and `marketplace:share` require fields
this probe omitted); `A 404` on `product:delete` for `STORE_OWNER` is the victim
product for that iteration not resolving. In each case the guard let the request
through, which is exactly what an `A` cell asserts. Anything that had been wrongly
denied would show `403`, and none does.

**‡** `A 0` = the request was allowed by the guard and then hung: the export
enqueues a BullMQ job and the local queue Redis is unavailable
(`QA_REPORT.md` §5). Recorded as allowed-by-guard, **BLOCKED** beyond that point.

### 2.1 Tally

| Metric | Count |
|---|---|
| Roles with working credentials | 10 of 12 |
| Actions per role | 41 |
| Cells executed | **410** |
| Expected ALLOW, allowed | **151** |
| Expected DENY, denied `403 PERMISSION_DENIED` | **259** |
| Expected DENY but allowed (**bypass**) | **0** |
| Expected ALLOW but denied (**over-restriction**) | **0** |
| Seed-intent vs token-grant mismatches | **0** |
| Cells NOT TESTED (roles 2, 3 — no credentials) | 82 |

Status distribution across the 151 allowed cells:
`200` ×80, `201` ×39, `204` ×9, `404` ×8, `422` ×14, hung ×1.
Every one of the 259 denied cells returned exactly `403` with error code
`PERMISSION_DENIED` and a `context.required` naming the missing permission — no
`401`s, no `500`s, no silent successes.

### 2.2 Selected cross-area denials, spelled out

The mandate asked for forbidden actions drawn from a *different* functional area
than the role's own. These are the sharpest of those, all verified by direct API
call with that role's token:

| Role | Attempted (different area) | Required | Result |
|---|---|---|---|
| Inventory Manager | delete a coupon | `coupon:delete` | `403 PERMISSION_DENIED` |
| Inventory Manager | moderate a review | `review:moderate` | `403` |
| Inventory Manager | refund an order | `order:refund` | `403` |
| Inventory Manager | invite staff | `user:invite` | `403` |
| Marketing Manager | adjust inventory | `inventory:adjust` | `403` |
| Marketing Manager | cancel an order | `order:cancel` | `403` |
| Marketing Manager | update tax rates | `tax:update` | `403` |
| Product Manager | delete a review | `review:delete` | `403` |
| Product Manager | cancel an order | `order:cancel` | `403` |
| Product Manager | reconcile payments | `payment:reconcile` | `403` |
| Order Manager | refund an order | `order:refund` | `403` (correct — the seed withholds refund from Order Manager on purpose) |
| Order Manager | create a product | `product:create` | `403` |
| Order Manager | read/create coupons | `coupon:read`/`create` | `403` |
| Customer Support | moderate a review | `review:moderate` | `403` |
| Customer Support | adjust inventory | `inventory:adjust` | `403` |
| Customer Support | delete a coupon | `coupon:delete` | `403` |
| Supplier | cancel an order | `order:cancel` | `403` |
| Supplier | delete a coupon | `coupon:delete` | `403` |
| Reseller | adjust inventory | `inventory:adjust` | `403` |
| Reseller | moderate a review | `review:moderate` | `403` |
| Store Admin | read/change subscription | `subscription:read`/`upgrade` | `403` (correct — billing stays with the Owner) |
| every tenant role | platform settlement queue | `platform.settlement:read` | `403` |
| every tenant role | tenant export | `platform.tenant:export` | `403` |
| Platform Super Admin | read tenant products/orders | `product:read`/`order:read` | `403` |

The two most consequential design intentions in the seed are both genuinely
enforced, not merely commented: `ORDER_MANAGER` is denied `order:refund`
("fulfilling an order and moving money back to a card are different levels of
trust") and `STORE_ADMIN` is denied `subscription:*` ("plan changes cost money and
stay with the owner").

---

## 3. JWT verification

Sent to `GET /api/v1/console/products?limit=1`. The tampered tokens were built by
decoding a **valid** lakeside `STORE_OWNER` token, editing the payload, and
re-attaching the **original** signature — which is the right test: it proves the
signature is actually verified rather than the payload merely parsed.

| # | Token presented | Result | Verdict |
|---|---|---|---|
| J1 | no `Authorization` header | `401 AUTH_TOKEN_MISSING` | PASS |
| J2 | `Bearer abc` | `401 AUTH_TOKEN_INVALID` | PASS |
| J3 | `Bearer ` (empty) | `401 AUTH_TOKEN_MISSING` | PASS |
| J4 | `Basic <valid token>` (wrong scheme) | `401 AUTH_TOKEN_MISSING` | PASS |
| J5 | **valid token, untouched (control)** | `200` | PASS |
| J6 | payload `tid` `2` → `1` (**tenant hop**) | `401 AUTH_TOKEN_INVALID` | PASS |
| J7 | payload `uid` `3` → `1` (**user impersonation**) | `401` | PASS |
| J8 | payload `userType` → `PLATFORM`, `tid` → `null` | `401` | PASS |
| J9 | payload `roles` → `["PLATFORM_SUPER_ADMIN"]` | `401` | PASS |
| J10 | payload `perms` → `["*"]` | `401` | PASS |
| J11 | payload `exp` → now + 10 years | `401` | PASS |
| J12 | signature stripped (`header.payload.`) | `401` | PASS |
| J13 | header replaced with `{"alg":"none"}` | `401` | PASS |
| J14 | signature swapped for another **valid** token's signature | `401` | PASS |
| J15 | payload `exp`/`iat` set to the past (expired) | `401` | PASS |
| J16 | signature truncated | `401` | PASS |
| J17 | signature bit-flipped | `401` | PASS |
| J18 | payload `aud`/`iss` → `other`/`evil` | `401` | PASS |
| J19 | garbage token shaped like a refresh token | `401` | PASS |

**19 of 19 rejected.** Note J6 and J10 in particular: rewriting the tenant claim
or granting yourself `["*"]` is refused at the signature check, so the whole
isolation and permission model rests on a verification path that is demonstrably
live. Natural expiry was also exercised incidentally — the access-token TTL is
600s and this phase ran well over an hour, with the harness re-authenticating on
expiry throughout.

Related session checks:

| Test | Result |
|---|---|
| `GET /auth/sessions` as each owner | 200; 54 vs 19 session identifiers, **0** overlap |
| northwind revoking a lakeside session by id | `404 Session '01M1YGWY1KJXA8D6BTEXZ9RF4J' not found` |

---

## 4. Bug reports

### RBAC-001 — `STORE_ADMIN` can escalate to `STORE_OWNER` by inviting one

| Field | Value |
|---|---|
| **Bug ID** | RBAC-001 |
| **Severity** | **P2** — in-tenant vertical privilege escalation. Not cross-tenant, and requires an already-highly-trusted role, but it defeats a documented restriction. |
| **Module** | User / invitations (`apps/api/src/modules/user/invitation.service.ts`) |
| **Page** | None — no staff-management UI exists yet (`QA_REPORT.md` §2.1). API only. |
| **Environment** | API `http://localhost:4000`, 2026-09-07 |
| **User** | `qa-store-admin@qa.test` (`STORE_ADMIN`, 152 permissions) |
| **Tenant** | northwind |
| **Precondition** | Attacker holds `user:invite` (`STORE_OWNER` or `STORE_ADMIN`) and controls a mailbox. |

**Steps to Reproduce**

1. Log in as `qa-store-admin@qa.test`.
2. Confirm the restriction is real: `GET /api/v1/console/subscription` and
   `POST /api/v1/console/subscription/change-plan` → both `403 PERMISSION_DENIED`
   (`subscription:read`, `subscription:upgrade`).
3. `POST /api/v1/console/invitations` with
   `{"email":"<mailbox you control>","firstName":"QA","lastName":"EscOwner","roleCodes":["STORE_OWNER"]}`.
4. Accept the invitation at `POST /api/v1/invitations/accept` and log in as the new user.

**Expected Result**

Either `403`, or a validation error refusing to grant a role whose permission set
is a strict superset of the inviter's. A role deliberately denied billing should
not be able to mint an account that has it.

**Actual Result**

Step 3 returns `201` and the invitation is created with
`"roles":["STORE_OWNER"]`. The new account, once accepted, holds all 160 tenant
permissions including `subscription:*` and `invoice:*` — the exact set the seed
withholds from Store Admin.

**Evidence**

```
STORE_ADMIN invites STORE_OWNER -> 201
{"success":true,"data":{"id":"01M1YGX2WJ9ZAG73V2BWDFDVWP",
 "email":"qa-esc-owner-1788804499516@qa.test","firstName":"QA","lastName":"EscOwner",
 "roles":["STORE_OWNER"],"storeId":null,"status":"PENDING","invitedBy":"QA STORE_ADMIN",
 "expiresAt":"2026-09-14T18:08:2…"}}
```

Contrast — platform roles **are** correctly refused, which shows the guard rail
exists but only spans the tenant/platform boundary:

```
STORE_ADMIN invites PLATFORM_SUPER_ADMIN -> 422
{"code":"VALIDATION_FAILED","message":"Unknown or not assignable role: PLATFORM_SUPER_ADMIN",
 "context":{"field":"roleCodes","missing":["PLATFORM_SUPER_ADMIN"]}}

LK STORE_OWNER invites PLATFORM_SUPPORT  -> 422
{"code":"VALIDATION_FAILED","message":"Unknown or not assignable role: PLATFORM_SUPPORT",
 "context":{"field":"roleCodes","missing":["PLATFORM_SUPPORT"]}}
```

**Console Error** — n/a. **Network Error** — n/a; the request succeeds.

**API** — `POST /api/v1/console/invitations`

**Request**

```http
POST /api/v1/console/invitations HTTP/1.1
Host: localhost:4000
Authorization: Bearer <qa-store-admin@qa.test access token>
Content-Type: application/json

{"email":"qa-esc-owner-1788804499516@qa.test","firstName":"QA",
 "lastName":"EscOwner","roleCodes":["STORE_OWNER"]}
```

**Response** — `201 Created`, body above.

**Root Cause**

`InvitationService.invite()` calls `resolveRoles(input.roleCodes, tenantId)`,
which validates that each requested role exists **and is tenant-assignable** —
hence the correct `422` for platform roles — but it does not compare the requested
role's permission set against the inviter's own. `PermissionsGuard` has already
been satisfied by the single code `user:invite`, and nothing downstream asks
whether the inviter is entitled to grant what they are granting. The seed's
`STORE_ADMIN` list includes `user:*` and `role:*` while excluding
`subscription:*`/`invoice:*`, so the ability to create principals is granted
alongside a restriction that creating principals trivially bypasses.

**Suggested Fix** *(recorded only — no fix applied in this discovery phase)*

Require that the inviter's effective permission set be a superset of every role
they assign (the standard "cannot grant what you do not hold" rule), and apply
the same check to any future direct role-assignment endpoint (`role:assign`).
Alternatively, reserve `STORE_OWNER` assignment to an existing owner. Either way
the check belongs in `resolveRoles()`, next to the tenant-assignability check that
already works.

**Retest Status** — NOT RETESTED.

---

### RBAC-002 — Console renders `403` as an empty state, not a permission message

| Field | Value |
|---|---|
| **Bug ID** | RBAC-002 |
| **Severity** | **P3** — usability and supportability. **Not** a security defect: the API denies correctly. |
| **Module** | Console (`apps/console/src/app/(app)/*`) |
| **Page** | `/coupons`, `/` (Dashboard), and by inspection every page whose data query can 403 |
| **Environment** | Console `http://localhost:3000`, real browser, 2026-09-07 |
| **User** | `qa-inventory-manager@qa.test` (`INVENTORY_MANAGER`, 16 permissions, no coupon permissions) |
| **Tenant** | northwind |
| **Precondition** | Log in as a role lacking the page's read permission. |

**Steps to Reproduce**

1. Log in to the console as `qa-inventory-manager@qa.test`.
2. Observe the Dashboard.
3. Navigate to `http://localhost:3000/coupons` (the nav link is present and clickable).

**Expected Result** — something that distinguishes "you do not have permission"
from "there is no data", and ideally a nav that does not advertise unreachable
sections.

**Actual Result**

The page renders in full and reports an empty result set. The underlying API call
returns `403`:

```
GET http://localhost:3000/coupons                                 -> 200 OK
GET http://localhost:4000/api/v1/console/coupons?page=1&limit=20  -> 403 Forbidden
```

but the rendered page says:

```
Coupons
Discount codes for the storefront.
[All statuses] [Active] [Archived]
Code  Discount  Usage  Status  Ends
No coupons match these filters.
```

The Dashboard shows the same class of mistranslation — `INVENTORY_MANAGER` lacks
`store:read`, so the store query 403s and the UI renders:

```
Dashboard
No store on this account yet
A store is created when your tenant is provisioned. If that has not happened,
the system status page will show whether the API is healthy.
```

which tells the user their store does not exist when in fact it does and they
simply cannot read it. That is actively misleading and will generate support
tickets.

**Evidence** — network log and rendered text above, captured in a real browser.

**Root Cause** — two separate things, both worth recording:

1. **No route-level gating, by design and acceptable.** The console has no
   middleware and no per-route permission gate; `use-auth.tsx` only redirects
   unauthenticated users to `/login`. `NAV_ITEMS` in `app/(app)/layout.tsx` is a
   flat static array with no permission predicate, so all eight links render for
   every role. Per the charter this is **acceptable** because the API genuinely
   blocks the calls — which this phase proved 259 times out of 259. Recorded as a
   finding for completeness, not as a defect.
2. **The actual defect:** the console *does* gate action buttons correctly —
   `usePermission()` is used in `products`, `coupons`, `customers`, `orders`,
   `inventory` and the dashboard, and no "New coupon" button rendered for this
   role — but the TanStack Query error paths do not distinguish a `403` from an
   empty `200`, so a denial falls through to the generic empty state.

**Suggested Fix** — branch on the error status in the shared query/error handling:
render an explicit "You do not have permission to view this" panel for `403`, keep
the empty state for a successful empty result, and consider filtering `NAV_ITEMS`
through `usePermission()` so roles are not shown sections they cannot open.

**Retest Status** — NOT RETESTED.

---

## 5. Not tested, and why

### `PLATFORM_SUPPORT` and `PLATFORM_BILLING` — NOT TESTED (no credentials obtainable)

These two roles are **NOT TESTED**. They are not passed, and they are not assumed
to work.

Both are `scope: 'PLATFORM'`, so a holder must be a `user_type = 'PLATFORM'` user
with `tenant_id IS NULL` (enforced by the `chk_users_tenant_correlation` check
constraint). The only mechanism in the codebase that creates such a user is
`seedDemoTenants()`, which hard-codes exactly one — `admin@ems.test` — and the
invitation flow used for the seven tenant roles cannot help: it creates
`userType: 'TENANT'` users inside the inviting tenant, and it explicitly refuses
platform roles as "not assignable" (verified live, twice — see RBAC-001's
evidence). There is no platform-user-creation API. Creating one would have meant a
direct database insert, which is outside what this phase is willing to do to a
system it is auditing.

Per the charter's fallback, their seeded grants were read directly from
`role_permissions` so at least the intent is on record and matches
`roles.seed.ts`:

**`PLATFORM_SUPPORT` — 9 grants**
`platform.domain:read`, `platform.log:read`, `platform.support:assign`,
`platform.support:close`, `platform.support:read`, `platform.support:update`,
`platform.tenant:impersonate`, `platform.tenant:read`, `platform.user:read`

Correctly **absent**: `platform.tenant:suspend`, `platform.tenant:delete`,
`platform.tenant:export`, and every billing/settlement code — matching the seed
comment "Impersonation without suspend/delete".

**`PLATFORM_BILLING` — 14 grants**
`platform.analytics:read`, `platform.billing:adjust`, `platform.billing:read`,
`platform.billing:refund`, `platform.plan:create`, `platform.plan:delete`,
`platform.plan:read`, `platform.plan:update`, `platform.settlement:approve`,
`platform.settlement:export`, `platform.settlement:pay`,
`platform.settlement:read`, `platform.settlement:run`, `platform.tenant:read`

Correctly **absent**: all `platform.support:*`, `platform.tenant:impersonate`.

Two of the three most consequential permissions in these sets were nonetheless
exercised behaviourally, from the other direction — which is partial but real
evidence that the codes are wired to the routes rather than merely seeded:

| Permission | Route | Evidence |
|---|---|---|
| `platform.settlement:read` | `GET /platform/settlements/pending-approval` | `200` with `platform.*`; `403 PERMISSION_DENIED (platform.settlement:read)` for all 9 tenant roles |
| `platform.settlement:run` | `POST /platform/settlements/run` | `403 PERMISSION_DENIED (platform.settlement:run)` from a tenant token |
| `platform.support:assign` / `:update` / `:close` | `POST /console/support-tickets/:id/{assign,resolve,close}` | `403 PERMISSION_DENIED` naming each code, from a tenant owner token — **the one part of the support module that is correctly guarded**, in contrast to SEC-001 |

**What remains genuinely untested:** whether these two roles are correctly
*denied* the platform permissions they lack — e.g. whether `PLATFORM_SUPPORT` is
actually refused `platform.tenant:suspend` and whether `PLATFORM_BILLING` is
refused `platform.support:*`. Nothing in this phase establishes that. 82 of the
492 possible cells (2 roles × 41 actions) are therefore NOT TESTED. Closing this
gap needs either a platform-user provisioning path or an agreed one-off seed
extension.

### Other blocked or unreachable items

| Item | Status | Reason |
|---|---|---|
| `platform.tenant:export` end to end | Guard PASS, execution **BLOCKED** | Enqueues BullMQ; no local queue Redis |
| Staff-management UI permission gating | **NOT IMPLEMENTED** | No staff/roles page exists |
| `marketplace:accept`/`reject`/`revoke` authorization | **BLOCKED** | Needs a reseller store that no API can provision (see `SECURITY_REPORT.md` §4.3) |
| Email-delivery-dependent flows beyond invitations | **BLOCKED** | No real SMTP; the sink used here captures but does not deliver |

---

## 6. Assessment

Authorization is the strongest part of the system this phase examined. The
architecture is deny-by-default at the framework level — `JwtAuthGuard` is
registered app-wide so a route without `@Public()` cannot be reached
unauthenticated, and `route-exposure.spec.ts` pins the `@Public()` set so widening
it is a reviewed act. On top of that, `PermissionsGuard` reads codes from a
verified token and resolves them through one shared matcher
(`PermissionResolverService.satisfies`), which is why 410 cells produced 410
correct outcomes: there is one decision point, not fifty-three per-controller
ones.

The scope firewall in `resolvePermissions()` deserves specific credit. It is not
just a comment — behaviourally, the `PLATFORM_SUPER_ADMIN` is denied every tenant
resource (`product:read`, `order:read`, even a specific product by id) and every
tenant role is denied every platform route. A platform "super" admin that cannot
silently read a merchant's orders is an unusual and good property, and it means
cross-tenant access from the platform side is a deliberate, separately-permissioned
act rather than ambient reach.

RBAC-001 is the one real gap, and it is a category the permission model has no
vocabulary for. Every check in the system answers "does this principal hold code
X?" — none answers "may this principal *grant* code X?". `user:invite` is treated
as one permission like any other, when it is really a meta-permission over the
whole set. The tenant/platform boundary is guarded (platform roles are refused),
so the idea was clearly considered; it just was not carried down to within-tenant
role ordering. Any future `role:assign` or `role:create` endpoint will inherit the
same gap, and `STORE_ADMIN` already holds `role:*`, so this is worth fixing at the
model level rather than patching the one endpoint.

RBAC-002 is not a security issue and should not be treated as one. It matters
because it makes the system's correct behaviour indistinguishable from a bug: a
merchant told "No store on this account yet" when they demonstrably have a store
will open a ticket, and whoever picks it up will not immediately see that the real
answer is "your role lacks `store:read`". The UI-versus-API distinction that the
charter insisted on is exactly right here — the UI looks broken and the API is
correct.

---

## 7. Cross-reference

Tenant isolation, including the one P0 (`SEC-001`, cross-tenant read and write of
support tickets), is in `SECURITY_REPORT.md`. Note the interaction: the support
module's *permission* checks are correct — `assign`, `resolve` and `close` all
demand `platform.support:*` and refuse a tenant owner — while its *tenant scoping*
is absent. RBAC passing on a module is not evidence that isolation passes on it,
and this phase found exactly one module where those two verdicts diverge.
