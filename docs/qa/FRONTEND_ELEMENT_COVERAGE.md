# EMS — Frontend Element Coverage (QA Phases 3 + 4)

**Phases:** 3 (Frontend element inventory) + 4 (Frontend functional testing)
**Executed:** 2026-09-08, live against the running dev stack
**Surfaces:** Merchant Console `http://localhost:3000` (21 pages) · Storefront `http://northwind.ems.localhost:3001` (6 pages)
**API:** `http://localhost:4000/api/v1` · MySQL `127.0.0.1:3307` · all three apps confirmed running, MySQL/Redis/Mongo up

**Method.** The inventory was derived by reading every page's source (including the shared
`primitives.tsx`, every `lib/queries/*` hook and every zod schema), then each element was
exercised in a real browser against the real API. Where a claim rests on a network request,
the request/status is quoted. Statuses used are exactly `PASS`, `FAIL`, `BLOCKED`,
`NOT IMPLEMENTED`, `NOT TESTED`, `SKIPPED` — none is ever silently promoted to PASS.

Bugs are in `BUG_REPORT.md` as `BUG-FE-001` … `BUG-FE-022`.

---

## 0. Summary counts

### 0.1 Pages

| Surface | Pages in scope | Pages exercised | Notes |
|---|---|---|---|
| Console — auth | 5 | 5 | 4 of the 5 are only reachable while *already signed in* — see BUG-FE-001 |
| Console — app | 16 | 16 | |
| Storefront | 6 | 6 | 2 pages' interactive elements BLOCKED by BUG-FE-003 |
| **Total** | **27** | **27** | |

### 0.2 Elements

| Category | Inventoried | Tested | PASS | FAIL | BLOCKED | NOT IMPL. | NOT TESTED |
|---|---|---|---|---|---|---|---|
| Buttons | 116 | 104 | 88 | 11 | 5 | 0 | 12 |
| Links | 47 | 43 | 43 | 0 | 0 | 0 | 4 |
| Inputs / textareas | 94 | 88 | 76 | 8 | 4 | 0 | 6 |
| Selects / dropdowns | 21 | 21 | 19 | 2 | 0 | 0 | 0 |
| Checkboxes / radios | 12 | 12 | 12 | 0 | 0 | 0 | 0 |
| Tables | 14 | 14 | 11 | 3 | 0 | 0 | 0 |
| Table row actions | 13 | 12 | 10 | 2 | 1 | 0 | 1 |
| Modals / dialogs | 8 | 8 | 8 | 0 | 0 | 0 | 0 |
| Tabs | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Pagination controls | 6 | 6 | 5 | 0 | 1 | 0 | 0 |
| **Total** | **331** | **308** | **272** | **26** | **11** | **0** | **23** |

**Tabs: there are no tab components anywhere in either app.** Not a gap — no page uses a
tabbed layout. Counted as 0 rather than omitted.

### 0.3 Every untested / blocked element, individually

`NOT TESTED` (23):

- ❌ `LOGIN-005` — MFA "Verify and sign in" button — **NOT TESTED** (no MFA-enabled account exists)
- ❌ `LOGIN-006` — MFA code input — **NOT TESTED** (same)
- ❌ `LOGIN-007` — "Use a recovery code" / "Use authenticator app" toggle — **NOT TESTED** (same)
- ❌ `LOGIN-008` — MFA "Start over" button — **NOT TESTED** (same)
- ❌ `RESET-004` — "New password" input — **NOT TESTED** (page unreachable, BUG-FE-001; no valid token obtainable without SMTP)
- ❌ `RESET-005` — "Confirm password" input — **NOT TESTED** (same)
- ❌ `RESET-006` — "Update password" submit — **NOT TESTED** (same)
- ❌ `RESET-007` — "Sign in" button on the success render — **NOT TESTED** (success state unreachable)
- ❌ `VERIFY-002` — "Sign in" button on the verified render — **NOT TESTED** (needs a real token)
- ❌ `INVITE-004` — "First name" input — **NOT TESTED** (needs a live invitation token; page also unreachable, BUG-FE-001)
- ❌ `INVITE-005` — "Last name" input — **NOT TESTED** (same)
- ❌ `INVITE-006` — "Password" input — **NOT TESTED** (same)
- ❌ `INVITE-007` — "Confirm password" input — **NOT TESTED** (same)
- ❌ `INVITE-008` — "Create my account" submit — **NOT TESTED** (same)
- ❌ `INVITE-009` — "Sign in" button on the done render — **NOT TESTED** (same)
- ❌ `DASH-021` — per-notification "Mark read" button — **NOT TESTED** (zero notifications exist; they are queue-produced, see §7 BLOCKED-1)
- ❌ `DASH-022` — notification title link (`actionUrl`) — **NOT TESTED** (same)
- ❌ `DASH-014` … `DASH-016` — FirstRunPanel CTAs ("Add product", "Open inventory", "View orders") — **NOT TESTED** (the first-run branch requires 0 products *and* 0 orders; northwind has 29 and 23, and creating a third tenant is forbidden in this environment)
- ❌ `DASH-013` — "Check system status" button on the no-store branch — **NOT TESTED** as designed (it *was* rendered incidentally under BUG-FE-008, but not exercised as the intended empty-store affordance)
- ❌ `PDETAIL-SF-012` — product-detail "Specifications" section — **NOT TESTED** (no product in the catalogue has `attributes` populated)
- ❌ `ORDDET-013` — "Refunded" totals row — **NOT TESTED** (no order has a non-zero refund; refunds have no console UI)

`BLOCKED` (11):

- ⛔ `DASH-002` — "Net revenue" stat tile — **BLOCKED** (reads `daily_sales_rollup`, populated only by a BullMQ processor; no queue Redis)
- ⛔ `DASH-003` — "Orders" stat tile — **BLOCKED** (same)
- ⛔ `DASH-005` — Net-revenue delta / sparkline — **BLOCKED** (same)
- ⛔ `DASH-006` — Orders delta / sparkline — **BLOCKED** (same)
- ⛔ `DASH-004` — "Customers" tile *new/returning* hint — **BLOCKED** (same rollup source)
- ⛔ `INVDET-016` — Transfer dialog end-to-end transfer — **BLOCKED** (northwind has exactly one warehouse and no console UI creates warehouses; the dialog's *validation* was fully tested and passes)
- ⛔ `INVDET-020` — Movement-history pagination — **BLOCKED** (only 1 movement row exists, so `totalPages <= 1` and the control does not render by design)
- ⛔ `SFPD-004` … `SFPD-008` — storefront product-detail interactive elements (quantity stepper −, quantity input, quantity +, "Add to cart", "View cart" status link) — **BLOCKED** by BUG-FE-003 (route never hydrates). Their underlying API behaviour was verified separately — see §6.3.

`NOT IMPLEMENTED` — no elements. Every element in the inventory exists in the shipped code.
The *verticals* with no frontend at all are listed in §8.

### 0.4 Result by module

| Module | Elements | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---|---|---|---|---|
| Shared app shell | 11 | 11 | 0 | 0 | 0 |
| Auth (5 pages) | 30 | 12 | 2 | 0 | 16 |
| Dashboard | 22 | 8 | 3 | 5 | 6 |
| System status | 4 | 4 | 0 | 0 | 0 |
| Sessions | 5 | 5 | 0 | 0 | 0 |
| Products (list / new / edit) | 60 | 51 | 9 | 0 | 0 |
| Orders (list / detail) | 33 | 31 | 1 | 0 | 1 |
| Inventory (list / detail) | 45 | 41 | 2 | 2 | 0 |
| Coupons (list / new / edit) | 48 | 44 | 4 | 0 | 0 |
| Customers (list / new / detail) | 51 | 45 | 6 | 0 | 0 |
| Storefront | 62 | 55 | 2 | 5 | 0 |
| **Total** | **371*** | **307** | **29** | **12** | **23** |

\* This per-module tally counts a few elements twice where one control is reachable from two
pages (e.g. the shared `Pagination` primitive). The authoritative unique-element count is
**331** in §0.2.

### 0.5 Which forms got the deep pass, and which got the light pass

**Deep pass** — required/optional, whitespace-only, over-max, Unicode/emoji, invalid format,
duplicate-value conflict against the real API, per-field error rendering, loading state,
success path, and a genuine server-side failure:

1. **Product create** (`/products/new`) — 14 elements, 9 distinct validation cases.
2. **Coupon create** (`/coupons/new`) — 16 elements, 6 distinct validation cases including the conditional `discountValue` field and a real 409.
3. **Customer create** (`/customers/new`) — 9 elements, 6 distinct validation cases.
4. **Storefront checkout address** (`/checkout`) — 13 elements, 7 distinct validation cases plus live-pricing debounce and a real order placement.

**Light pass** — required-vs-optional, one invalid value, and empty submit at minimum:

Product edit, Coupon edit, Customer profile, Customer address dialog (this one got close to a
deep pass: required ×4, E.164 phone, edit-prefill, and a real save), Inventory adjust dialog
(also near-deep: 4 validation cases + a real API rejection), Inventory transfer dialog,
Inventory reorder-settings dialog, Login, Forgot password, Wishlist add dialog.

**No pass** — Reset password, Verify email, Accept invite (all three unreachable / tokenless;
see §0.3).

---

## 1. Shared shell — `apps/console/src/app/(app)/layout.tsx`

| ID | Element | Type | Test | Status |
|---|---|---|---|---|
| SHELL-001 | "Skip to content" | link → `#main` | Present, `sr-only` until focused, target `<div id="main">` exists | PASS |
| SHELL-002 | "EMS" brand | link → `/` | Navigates to dashboard | PASS |
| SHELL-003 | "Dashboard" | nav link → `/` | Correct route, `aria-current="page"` when active | PASS |
| SHELL-004 | "Orders" | nav link → `/orders` | Correct route | PASS |
| SHELL-005 | "Products" | nav link → `/products` | Correct route | PASS |
| SHELL-006 | "Inventory" | nav link → `/inventory` | Correct route | PASS |
| SHELL-007 | "Customers" | nav link → `/customers` | Correct route | PASS |
| SHELL-008 | "Coupons" | nav link → `/coupons` | Correct route | PASS |
| SHELL-009 | "Sessions" | nav link → `/sessions` | Correct route | PASS |
| SHELL-010 | "System" | nav link → `/system` | Correct route | PASS |
| SHELL-011 | "Sign out" | button | `POST /auth/logout`, token cleared, redirect to `/login`; re-login works | PASS |

Loading state: centred spinner + `sr-only "Loading"` while `status !== 'authenticated'` — observed. PASS.
Unauthenticated: `router.replace('/login?next=<path>')` — observed, and the `next` round-trip works (signed in from `/customers`, landed back on `/customers`). PASS.
Mobile (375px): nav is `overflow-x-auto` and scrolls **within itself** (`scrollWidth` 628 > `clientWidth` 188) while the document does **not** overflow (`scrollWidth` == `innerWidth`). The earlier nav horizontal-scroll fix has **not** regressed. PASS.

---

## 2. Auth pages

### 2.1 `/login` — LOGIN-001 … LOGIN-008

| ID | Element | Test | Status |
|---|---|---|---|
| LOGIN-001 | Email input | Empty → inline error; `notanemail` → "Must be a valid email address" | PASS (message quality: BUG-FE-013) |
| LOGIN-002 | Password input | Empty → "Password is required" | PASS |
| LOGIN-003 | "Sign in" submit | Wrong password → real `POST /auth/login → 401`, renders "Incorrect email or password" (non-enumerating). Correct password → `200`, redirect to `/` | PASS |
| LOGIN-004 | "Forgot your password?" | link → `/forgot-password`, correct route | PASS |
| LOGIN-005 | MFA "Verify and sign in" | — | NOT TESTED |
| LOGIN-006 | MFA code input | — | NOT TESTED |
| LOGIN-007 | MFA method toggle | — | NOT TESTED |
| LOGIN-008 | MFA "Start over" | — | NOT TESTED |

Empty-form submit produces **both** field errors and fires **no** request — verified via network log. PASS.
`rememberDevice` and `tenantSlug` are in the schema with **no rendered control** — recorded, not a bug.

### 2.2 `/forgot-password` — FORGOT-001 … FORGOT-004

| ID | Element | Test | Status |
|---|---|---|---|
| FORGOT-001 | Email input | Empty → inline error; `notanemail` → "Must be a valid email address" | PASS |
| FORGOT-002 | "Send reset link" submit | Unknown address → non-enumerating "If an account exists for that address, a reset link is on its way." | PASS |
| FORGOT-003 | "try again" (sent state) | Returns to the form, resets it | PASS |
| FORGOT-004 | "Back to sign in" | link → `/login` | PASS |

Page reachable **only while signed in** — BUG-FE-001. Actual email delivery: BLOCKED (no SMTP).

### 2.3 `/reset-password` — RESET-001 … RESET-007

| ID | Element | Test | Status |
|---|---|---|---|
| RESET-001 | No-token render | "Link not valid — This reset link is missing its token." | PASS |
| RESET-002 | "Request a new link" | link → `/forgot-password` | PASS |
| RESET-003 | Bad-token render | **FAIL** — `?token=<bogus>` redirects to `/login` instead of rendering the form or an error | FAIL (BUG-FE-001) |
| RESET-004 | "New password" input | — | NOT TESTED |
| RESET-005 | "Confirm password" input | — | NOT TESTED |
| RESET-006 | "Update password" submit | — | NOT TESTED |
| RESET-007 | Success "Sign in" button | — | NOT TESTED |

### 2.4 `/verify-email` — VERIFY-001 … VERIFY-003

| ID | Element | Test | Status |
|---|---|---|---|
| VERIFY-001 | No-token render | "Verification failed — This verification link is missing its token." + "Back to sign in" | PASS |
| VERIFY-002 | Verified "Sign in" button | — | NOT TESTED |
| VERIFY-003 | Bad-token auto-verify | **FAIL** — fires `POST /auth/verify-email → 401`, then redirects to `/login`; the page's own "Verification failed" state never shows | FAIL (BUG-FE-001) |

### 2.5 `/accept-invite` — INVITE-001 … INVITE-009

| ID | Element | Test | Status |
|---|---|---|---|
| INVITE-001 | No-token render | "Invitation not valid — … invalid, already used, revoked, or expired." | PASS |
| INVITE-002 | "Back to sign in" | link → `/login` | PASS |
| INVITE-003 | Bad-token render | Redirects to `/login` rather than showing the invalid-invitation card | FAIL (BUG-FE-001) |
| INVITE-004 … 009 | First name, Last name, Password, Confirm password, "Create my account", success "Sign in" | — | NOT TESTED |

---

## 3. Dashboard — `/` — DASH-001 … DASH-022

| ID | Element | Type | Test | Status |
|---|---|---|---|---|
| DASH-001 | "Reporting period" select | select | Changing 30 → 7 → 90 fires **new** `GET /console/reports/sales-summary` for both the current *and* the prior comparison window with correct date maths (7d: `09-02..09-08` vs `08-26..09-01`; 90d: `06-11..09-08` vs `03-13..06-10`) — verified in the network log, not just the UI | PASS |
| DASH-002 | "Net revenue" tile | stat | Shows ₹479.98 / 1 order while 23 orders exist | BLOCKED |
| DASH-003 | "Orders" tile | stat | Same rollup source | BLOCKED |
| DASH-004 | "Customers" tile | stat | Count itself correct (2 → 3 after my QA customer); new/returning hint from the rollup | PASS (hint BLOCKED) |
| DASH-005 | Net-revenue delta + sparkline | — | "No prior data" | BLOCKED |
| DASH-006 | Orders delta + sparkline | — | "No prior data" | BLOCKED |
| DASH-007 | "Products" tile | stat | 28 → 29 after creating a product; "1 low on stock" matches `/console/inventory/low-stock` | PASS |
| DASH-008 | "Add product" | link → `/products/new` | Correct route; hidden for `ORDER_MANAGER` (lacks `product:create`) | PASS |
| DASH-009 | "View all" (recent orders) | link → `/orders` | Correct route | PASS |
| DASH-010 | Order-number links (×5) | links → `/orders/{id}` | All five resolve to the right order | PASS |
| DASH-011 | Recent-orders table | table | 5 real rows, correct status badges, totals, timestamps | PASS |
| DASH-012 | Low-stock row link | link → `/inventory/{productId}` | Correct route | PASS |
| DASH-013 | "Check system status" | button | — | NOT TESTED |
| DASH-014 … 016 | FirstRunPanel CTAs | links | — | NOT TESTED |
| DASH-017 | Low-stock badge | badge | Count matches the table | PASS |
| DASH-018 | "{n} more" overflow link | link → `/inventory` | Only 1 low-stock row, so `rows.length > 4` is false and it correctly does not render | PASS (by design) |
| DASH-019 | Activity panel | panel | Empty state "Nothing new — Order, payment and stock notifications land here." | PASS |
| DASH-020 | Activity unread badge | badge | Not rendered (0 unread) — correct | PASS |
| DASH-021 | "Mark read" | button | — | NOT TESTED |
| DASH-022 | Notification title link | link | — | NOT TESTED |

**Loading:** `DashboardSkeleton` with `aria-busy` + `sr-only role="status" "Loading dashboard"` — observed on first paint. PASS.
**Empty:** for a role without `store:read` it wrongly claims no store exists — FAIL, BUG-FE-008.
**Error:** none of the eight queries reads `isError`; a failed fetch renders `—` / an empty table indistinguishably from real emptiness — FAIL, BUG-FE-007.
**Console/network on load:** no errors, no failed requests (as `owner@northwind.test`). PASS.
**Mobile 375px:** single-column, no document overflow, recent-orders timestamps stay on one line (the earlier row-height fix has not regressed). PASS.

---

## 4. System status — `/system` — SYS-001 … SYS-004

| ID | Element | Test | Status |
|---|---|---|---|
| SYS-001 | Dependency list | `mysql up 8 ms`, `redis up 252 ms`, `mongo up 8 ms` from a live `GET /health/ready` | PASS |
| SYS-002 | "refreshes every 10s" / "checking…" live region | Renders, `aria-live="polite"` | PASS |
| SYS-003 | Migrations row | "up-to-date" from `GET /health/startup` | PASS |
| SYS-004 | "API reference (Swagger)" | link → `http://localhost:4000/api/docs` — correct origin, `/api/v1` correctly stripped | PASS |

Error state (`Cannot reach the API at …`) — NOT TESTED (the API was up throughout; it did hot-restart mid-run and the page recovered on its own).

---

## 5. Sessions — `/sessions` — SESS-001 … SESS-005

| ID | Element | Test | Status |
|---|---|---|---|
| SESS-001 | Session list | 71 real rows from `GET /auth/sessions` | PASS |
| SESS-002 | "This device" marker | Exactly one row marked, matching the live session | PASS |
| SESS-003 | "Revoke" (non-current) | `DELETE /auth/sessions/{id} → 200`, list refetched, count 71 → 70 | PASS |
| SESS-004 | Per-row loading state | The clicked button is `disabled` during the mutation and others are not — correctly keyed per row | PASS |
| SESS-005 | "Sign out here" (current) | Not clicked deliberately; **however** revoking a sibling session in my own token family did end my session and bounce me to `/login`, which is correct end-to-end revocation behaviour | PASS (indirect) |

Empty state: none exists (an empty array renders an empty `<ul>`) — cannot occur in practice, recorded not filed.
Mutation error surfacing: `revoke` has no `onError`; a failed revoke would show nothing — same family as BUG-FE-007.
Observations filed as P3: no confirmation dialog on a destructive Revoke; no pagination for 71 rows; "last used" reads "not since sign-in" for every row including the active one (BUG-FE-017).

---

## 6. Products, Orders, Inventory, Coupons, Customers

### 6.1 Products list — `/products` — PRODUCTS-LIST-001 … 014

| ID | Element | Test | Status |
|---|---|---|---|
| PRODUCTS-LIST-001 | "New product" button | Navigates to `/products/new`; **hidden** for `ORDER_MANAGER` | PASS |
| PRODUCTS-LIST-002 | Search input | Accepts text | PASS |
| PRODUCTS-LIST-003 | "Search" submit | Fires `GET …&q=QA-FE` (**200**) but the result set is unfiltered — 29 rows for any term, including `ZZZNOMATCH` | **FAIL** (BUG-FE-002) |
| PRODUCTS-LIST-004 | Status filter select | `ARCHIVED` → `…&status=ARCHIVED` → correct empty state; `DRAFT` → 14 rows. Real query change verified in the network log | PASS |
| PRODUCTS-LIST-005 | Products table | 20 real rows, correct name/SKU/badge/price/updated | PASS |
| PRODUCTS-LIST-006 | Product name link | → `/products/{id}`, loads the right product | PASS |
| PRODUCTS-LIST-007 | Row "Publish" (DRAFT only) | `POST /console/products/{id}/publish → 200`; DRAFT → ACTIVE, `publishedAt` set. Correctly absent on non-DRAFT rows | PASS |
| PRODUCTS-LIST-008 | Publish loading state | Clicking one Publish disabled **all 9** Publish buttons (measured 0 → 9/9 disabled) | **FAIL** (BUG-FE-014) |
| PRODUCTS-LIST-009 | Row "Edit" | → `/products/{id}`; **hidden** for `ORDER_MANAGER` | PASS |
| PRODUCTS-LIST-010 | Row "Delete" | Opens the confirm dialog; **hidden** for `ORDER_MANAGER` | PASS |
| PRODUCTS-LIST-011 | Delete dialog | Title "Delete product", description quotes the product name | PASS |
| PRODUCTS-LIST-012 | Dialog Cancel / X / Escape / outside-click | All four close it with **no** side effect (product still listed after each) | PASS |
| PRODUCTS-LIST-013 | Dialog "Delete" confirm | `DELETE …/{id} → 204`, dialog closes, row disappears, list refetches to 20 rows | PASS |
| PRODUCTS-LIST-014 | Pagination Previous / Next | "Page 1 of 2"; Next → `?page=2` with **9 genuinely different rows** (20 + 9 = 29 = reported total). Correctly hidden when `totalPages <= 1` | PASS |

Empty state: "No products match these filters." PASS. Loading: "Loading…" row. PASS.
Error state: `isError` never read — a 403 renders as an empty result. FAIL (BUG-FE-007).
Sort: **no sort control exists** on any column despite the API supporting `sort`. Recorded, not filed as a bug.
An empty "Actions" column header still renders for roles with no row actions — BUG-FE-019 (P3).
Mobile 375px: no document overflow; the table scrolls inside its own `overflow-x:auto` wrapper (708 > 325); row heights uniform at 113px. PASS.

### 6.2 Product create — `/products/new` — PRODUCTS-NEW-001 … 014

| ID | Element | Test | Status |
|---|---|---|---|
| PRODUCTS-NEW-001 | Name input | Empty → error; whitespace-only `"   "` → error (trim works); 600 chars → "at most 500"; emoji + CJK accepted and persisted verbatim | PASS (message quality BUG-FE-013) |
| PRODUCTS-NEW-002 | SKU input | Empty passes client-side, then `POST → 422` mapped inline to the field: "sku is required unless type is VARIABLE" | PASS (wording BUG-FE-022) |
| PRODUCTS-NEW-003 | Price input | Empty → "Price is required". `abc` → `POST → 422` on `priceMinor`, a field with **no rendered control** → **no error shown at all** | **FAIL** (BUG-FE-004) |
| PRODUCTS-NEW-004 | Compare-at price input | `1500` → stored `150000` minor | PASS |
| PRODUCTS-NEW-005 | Status select | 4 options; `DRAFT` default; selection honoured on create | PASS |
| PRODUCTS-NEW-006 | Visibility select | 4 options; `VISIBLE` default | PASS |
| PRODUCTS-NEW-007 | Brand select | Only "None" — correct, `GET /console/brands` genuinely returns `[]` | PASS |
| PRODUCTS-NEW-008 | Category select | Renders the option label as `"/1/"` (the materialised path) instead of `"Widgets"` (the name) | **FAIL** (BUG-FE-012) |
| PRODUCTS-NEW-009 | Short description input | Emoji + accents accepted and persisted | PASS |
| PRODUCTS-NEW-010 | Description textarea | Accepts multi-line | PASS |
| PRODUCTS-NEW-011 | "Track inventory" checkbox | Defaults checked; toggles | PASS |
| PRODUCTS-NEW-012 | "Cancel" button | Returns to `/products` without creating | PASS |
| PRODUCTS-NEW-013 | "Create product" submit | Valid data → `POST → 201`, redirect to `/products/{id}`; price `1234.56` → `123456` minor (exact) | PASS |
| PRODUCTS-NEW-014 | Duplicate-SKU failure | `POST → 409` → root Alert "SKU 'QA-FE-SKU-001' is already in use" | PASS |

Route permission gate: **none** — an `ORDER_MANAGER` can open the form, and because `GET /console/stores` 403s for that role the submit is a silent no-op with no request and no message. FAIL (BUG-FE-009).
Keyboard: `autoFocus` lands on Name; Tab order is name → sku → price → comparePrice → status → visibility → brandId → categoryId → shortDescription → description → checkbox → Cancel → Create; no negative tabindex; `:focus-visible` matches on real Tab and paints a visible 2px white + 4px blue ring. PASS.

### 6.3 Product edit — `/products/[id]` — PRODUCTS-EDIT-001 … 006

| ID | Element | Test | Status |
|---|---|---|---|
| PRODUCTS-EDIT-001 | Prefill | `priceMinor 50000` → `"500.00"`; name/SKU/status/visibility all correct | PASS |
| PRODUCTS-EDIT-002 | Price required | Empty **and** whitespace-only → "Price is required" | PASS |
| PRODUCTS-EDIT-003 | "Save changes" | `PUT → 200`; `777.77` → `77777`, `999` → `99900`, status → `ACTIVE`, name changed — all verified in the DB-backed API response; redirects to `/products` | PASS |
| PRODUCTS-EDIT-004 | "Back" button | Returns to `/products` | PASS |
| PRODUCTS-EDIT-005 | Category select | Same `"/1/"` label defect | **FAIL** (BUG-FE-012) |
| PRODUCTS-EDIT-006 | Permission gating | As `ORDER_MANAGER`: all 10 inputs **and** the checkbox are `disabled`, "Save changes" is not rendered, only "Back" remains | PASS |
| — | Invalid id in URL | `/products/NOTAREALID` → `GET → 404` → "This product could not be found." | PASS |

### 6.4 Orders list — `/orders` — ORDERS-LIST-001 … 007

| ID | Element | Test | Status |
|---|---|---|---|
| ORDERS-LIST-001 | Status filter | `CANCELLED` → `…&status=CANCELLED` → exactly the 6 cancelled orders | PASS |
| ORDERS-LIST-002 | Payment-status filter | `PAID` → combines into `…&status=CANCELLED&paymentStatus=PAID` → correct empty state | PASS |
| ORDERS-LIST-003 | Fulfilment-status filter | 6 options, feeds the same query | PASS |
| ORDERS-LIST-004 | Orders table | 19 → 23 real rows across the run; badges, totals, timestamps correct | PASS |
| ORDERS-LIST-005 | Order-number link | → `/orders/{id}` | PASS |
| ORDERS-LIST-006 | Pagination | 23 rows at limit 20 → "Page 1 of 2", Next works | PASS |
| ORDERS-LIST-007 | Empty state | "No orders match these filters." | PASS |

No search input on this page (by design). Error state: same defect as products — BUG-FE-007.
Filters live in React state only and are never written to the URL, so a page change or a back-navigation drops them from the URL — recorded, low impact, not filed.

### 6.5 Order detail — `/orders/[id]` — ORDDET-001 … 014

Exercised end-to-end on **my own** order `ORD-000020` (created via the storefront during this
phase) and `ORD-000021` for the cancel path. Pre-existing real orders were read only.

| ID | Element | Test | Status |
|---|---|---|---|
| ORDDET-001 | "← Back to orders" | Returns to `/orders` | PASS |
| ORDDET-002 | Status badges ×3 | `CONFIRMED / PENDING / UNFULFILLED` correct | PASS |
| ORDDET-003 | "Put on hold" | `POST …/hold` → `CONFIRMED` → `ON_HOLD`; the button is replaced by "Resume" | PASS |
| ORDDET-004 | "Resume" | `POST …/resume` → back to `CONFIRMED`; buttons revert | PASS |
| ORDDET-005 | "Fulfil remaining items" | `POST …/fulfil` → item line "fulfilled 3/3", fulfilment `FULFILLED`, status `SHIPPED`; the button disappears (no open items) and "Close order" appears | PASS |
| ORDDET-006 | "Close order" | `POST …/close` → `COMPLETED`; **all** action buttons correctly disappear | PASS |
| ORDDET-007 | "Cancel order" (opener) | Opens the confirm dialog | PASS |
| ORDDET-008 | Cancel dialog "Never mind" | Closes with no change (order still `CONFIRMED`) | PASS |
| ORDDET-009 | Cancel dialog "Cancel order" | `POST …/cancel` → `CANCELLED`, all actions removed, timeline row added | PASS |
| ORDDET-010 | Items table | Name, SKU, `fulfilled n/m`, qty, line total all correct | PASS |
| ORDDET-011 | Totals block | `ORD-000004`: 21,499.00 − 2,149.90 + 50.00 + 0 + 30.00 = **19,429.10** = displayed total. `ORD-000020`: 64,497.00 + 50.00 + 30.00 = **64,577.00** = displayed total. Arithmetically exact, COD fee itemised | PASS |
| ORDDET-012 | Discount row sign | Shown as a positive `₹2,149.90` with no minus, unlike the storefront's `− ₹…` | **FAIL** (BUG-FE-016, P3) |
| ORDDET-013 | "Refunded" row | — | NOT TESTED |
| ORDDET-014 | Timeline | Records `— → PENDING`, `PENDING → CONFIRMED`, `CONFIRMED → ON_HOLD`, `ON_HOLD → CONFIRMED`, `FULFILMENT: UNFULFILLED → FULFILLED`, `SHIPPED → COMPLETED`. The `CONFIRMED → SHIPPED` order transition caused by fulfilment is **not** logged as an ORDER event | PASS with gap (BUG-FE-018, P3) |
| — | Invalid id in URL | `/orders/NOTAREALID` → 404 → "This order could not be found." | PASS |
| — | Shipping address card | Renders recipient/lines/city/state/postcode/country correctly | PASS |

### 6.6 Inventory landing — `/inventory` — INV-001 … 005

| ID | Element | Test | Status |
|---|---|---|---|
| INV-001 | "Find a product" input | Accepts text | PASS |
| INV-002 | Search results list | `ZZZNOMATCH` returns 5 **unrelated** products; the term is ignored | **FAIL** (BUG-FE-002) |
| INV-003 | Result → `/inventory/{id}` link | Correct route | PASS |
| INV-004 | Low-stock table | 1 real row (`Test Widget` 12 of 20), badge variant correct | PASS |
| INV-005 | Empty / loading states | "Nothing is at or below its reorder point." / "Loading…" | PASS |

There is **no** "no matches" message for the search list, so a genuine miss would show nothing — moot while BUG-FE-002 stands.
As `ORDER_MANAGER` the page claims "No store found for this account yet." — FAIL (BUG-FE-008).

### 6.7 Inventory detail — `/inventory/[productId]` — INVDET-001 … 020

| ID | Element | Test | Status |
|---|---|---|---|
| INVDET-001 | "← Back to inventory" | Correct route | PASS |
| INVDET-002 | Stock-by-warehouse table | Empty state "No stock recorded for this product yet."; after the adjustment: `Main Warehouse 25 / 0 / 0 / 25` | PASS |
| INVDET-003 | Movement-history table | Empty state "No movements recorded yet."; after: `COUNT_CORRECTION +25 → 25`, reason and timestamp correct | PASS |
| INVDET-004 | "Adjust stock" button | Opens the dialog | PASS |
| INVDET-005 | Adjust: warehouse select | Empty → "Warehouse is required" | PASS |
| INVDET-006 | Adjust: quantity input | Empty → "Whole number only"; `5.5` → "Whole number only"; `abc` → "Whole number only"; `0` → "Must not be zero" | PASS |
| INVDET-007 | Adjust: reason-type select | 5 options (`ADJUSTMENT`…`COUNT_CORRECTION`) | PASS |
| INVDET-008 | Adjust: note input | Optional, persisted to the movement row | PASS |
| INVDET-009 | "Apply adjustment" | `POST /console/inventory/adjust` → stock row + movement row created | PASS |
| INVDET-010 | Adjust: real API failure | `-100` against 25 on hand → dialog **stays open** and shows "Adjustment would take stock below zero"; stock unchanged | PASS |
| INVDET-011 | Adjust: Cancel | Closes, no side effect | PASS |
| INVDET-012 | "Transfer stock" button | Opens the dialog | PASS |
| INVDET-013 | Transfer: from / to selects | Empty → "Required" ×2 | PASS |
| INVDET-014 | Transfer: quantity | Empty and `-3` → "Positive whole number only" | PASS |
| INVDET-015 | Transfer: same-warehouse refine | from == to → "Choose two different warehouses" | PASS |
| INVDET-016 | Transfer: successful transfer | — | BLOCKED (one warehouse only) |
| INVDET-017 | Row "Edit" → settings dialog | Opens "Reorder settings — Main Warehouse" | PASS |
| INVDET-018 | Settings: reorder point / qty / bin | `10` / `50` / `QA-BIN-01` → `POST /console/inventory/settings`, table shows reorder point 10 and bin `QA-BIN-01` | PASS |
| INVDET-019 | Permission gating | `inventory:adjust` gates both header buttons, the trailing column, the row Edit, and all three dialogs are not mounted without it | PASS (verified by source; owner path exercised live) |
| INVDET-020 | Movement pagination | — | BLOCKED (1 movement, control correctly absent) |

### 6.8 Coupons list — `/coupons` — COUPONS-LIST-001 … 008

| ID | Element | Test | Status |
|---|---|---|---|
| COUPONS-LIST-001 | Status filter | `ARCHIVED` → `…&status=ARCHIVED` → "No coupons match these filters."; `ACTIVE` → 16 rows. Real query change verified | PASS |
| COUPONS-LIST-002 | "New coupon" | → `/coupons/new`; gated on `coupon:create` | PASS |
| COUPONS-LIST-003 | Coupons table | 16 real rows; code, discount, usage, status, end date | PASS |
| COUPONS-LIST-004 | Code link | → `/coupons/{id}` | PASS |
| COUPONS-LIST-005 | Discount column | Renders `12.5000% off` — 4 trailing decimals from the raw DB value | **FAIL** (BUG-FE-015, P3) |
| COUPONS-LIST-006 | Row "Delete" | Opens the confirm dialog; gated on `coupon:delete` | PASS |
| COUPONS-LIST-007 | Delete dialog | "Never mind" closes with no delete; "Delete" removes the row from the list | PASS |
| COUPONS-LIST-008 | Pagination | 16 rows at limit 20 → correctly not rendered | PASS (by design) |

As `ORDER_MANAGER` the list request returns **403** and the page renders "No coupons match these filters." — FAIL (BUG-FE-007).

### 6.9 Coupon create — `/coupons/new` — COUPONS-NEW-001 … 016

| ID | Element | Test | Status |
|---|---|---|---|
| COUPONS-NEW-001 | Code input | Empty → error; `summer 10!` → "Letters, digits, hyphens and underscores only"; auto-uppercased | PASS (empty-message quality BUG-FE-013) |
| COUPONS-NEW-002 | Name input | Emoji + accents accepted and persisted | PASS |
| COUPONS-NEW-003 | Discount-type select | 3 options; switching to `FREE_SHIPPING` **removes** the discount-value field, switching back restores it | PASS |
| COUPONS-NEW-004 | Discount-value input | Empty → "Discount value is required" (the cross-field refine fires); `150` for a PERCENTAGE coupon is **accepted** | **FAIL** (BUG-FE-010) |
| COUPONS-NEW-005 | Max discount input | Optional, converts rupees → minor | PASS |
| COUPONS-NEW-006 | Minimum order input | Optional | PASS |
| COUPONS-NEW-007 | Total use limit | Optional numeric | PASS |
| COUPONS-NEW-008 | Per-customer limit | Optional numeric | PASS |
| COUPONS-NEW-009 | "Starts" datetime-local | Optional | PASS |
| COUPONS-NEW-010 | "Ends" datetime-local | Optional | PASS |
| COUPONS-NEW-011 | Description textarea | Optional | PASS |
| COUPONS-NEW-012 | "Combinable" checkbox | Toggles | PASS |
| COUPONS-NEW-013 | "Apply automatically" checkbox | Toggles | PASS |
| COUPONS-NEW-014 | "Cancel" | Returns to `/coupons` | PASS |
| COUPONS-NEW-015 | "Create coupon" | `POST → 201`, redirect to `/coupons/{id}` | PASS |
| COUPONS-NEW-016 | Duplicate-code failure | `POST → 409` → "Coupon code 'QA-FE-OVER100' already exists" | PASS |

### 6.10 Coupon edit — `/coupons/[id]` — COUPONS-EDIT-001 … 008

| ID | Element | Test | Status |
|---|---|---|---|
| COUPONS-EDIT-001 | Prefill | Code, status, type and value all populated | PASS |
| COUPONS-EDIT-002 | Discount-value display | `150.0000` instead of `150` | **FAIL** (BUG-FE-015, P3) |
| COUPONS-EDIT-003 | Status select | `ACTIVE` / `ARCHIVED` | PASS |
| COUPONS-EDIT-004 | Conditional discount-value field | Hidden for `FREE_SHIPPING`, as on create | PASS |
| COUPONS-EDIT-005 | "Save changes" | `PUT → 200`; `12.5` and a Unicode name persisted (list shows `12.5000% off` and the emoji name) | PASS |
| COUPONS-EDIT-006 | "Cancel" | Returns to `/coupons` | PASS |
| COUPONS-EDIT-007 | Permission gating | `coupon:update` sets `disabled` on every field and hides the whole Cancel/Save row (verified by source) | PASS |
| COUPONS-EDIT-008 | Invalid id | `/coupons/<bogus>` → "This coupon could not be found." | PASS |

### 6.11 Customers list — `/customers` — CUSTOMERS-LIST-001 … 006

| ID | Element | Test | Status |
|---|---|---|---|
| CUSTOMERS-LIST-001 | Status filter | 4 options; feeds `…&status=` | PASS |
| CUSTOMERS-LIST-002 | "New customer" | → `/customers/new`; **hidden** for `ORDER_MANAGER` (lacks `customer:create`) | PASS |
| CUSTOMERS-LIST-003 | Customers table | Real rows with display name, contact, orders, total spent, status badge, joined date | PASS |
| CUSTOMERS-LIST-004 | Customer name link | → `/customers/{id}` | PASS |
| CUSTOMERS-LIST-005 | Pagination | 3 rows at limit 20 → correctly not rendered | PASS (by design) |
| CUSTOMERS-LIST-006 | Empty state | "No customers match these filters." | PASS |

**There is no Export button on this page** (and none anywhere in the console) — noted because it is a common assumption; nothing to test.
No row actions on this table at all — by design.

### 6.12 Customer create — `/customers/new` — CUSTOMERS-NEW-001 … 009

| ID | Element | Test | Status |
|---|---|---|---|
| CUSTOMERS-NEW-001 | First name input | Emoji + accents accepted and persisted | PASS |
| CUSTOMERS-NEW-002 | Last name input | Accepted | PASS |
| CUSTOMERS-NEW-003 | Email input | `notanemail` → "Must be a valid email address" | PASS |
| CUSTOMERS-NEW-004 | Phone-only creation | Phone filled, email blank → blocked by "String must contain at least 3 character(s)" on **email**, contradicting the field's own hint | **FAIL** (BUG-FE-005) |
| CUSTOMERS-NEW-005 | Phone input (invalid) | `12345` → **no error, no request, nothing happens** — the phone field has no rendered error slot | **FAIL** (BUG-FE-006) |
| CUSTOMERS-NEW-006 | Password input | `short` → "Must be at least 8 characters"; blank allowed | PASS |
| CUSTOMERS-NEW-007 | "Accepts marketing" checkbox | Toggles and persists | PASS |
| CUSTOMERS-NEW-008 | "Cancel" | Returns to `/customers` | PASS |
| CUSTOMERS-NEW-009 | "Create customer" | Valid data → `POST → 201`, redirect to `/customers/{id}` with the Unicode name intact | PASS |

### 6.13 Customer detail — `/customers/[id]` — CUSTOMERS-DET-001 … 024

| ID | Element | Test | Status |
|---|---|---|---|
| CUSTOMERS-DET-001 | "← Back to customers" | Correct route | PASS |
| CUSTOMERS-DET-002 | Status badge | `ACTIVE` → `BLOCKED` after the profile save | PASS |
| CUSTOMERS-DET-003 | 4 stat tiles | Orders / Total spent / Avg order / Loyalty points all render | PASS |
| CUSTOMERS-DET-004 | First / last name inputs | Prefilled, editable | PASS |
| CUSTOMERS-DET-005 | Customer-group input | `QA-VIP` saved | PASS |
| CUSTOMERS-DET-006 | Status select | 3 options; `BLOCKED` saved | PASS |
| CUSTOMERS-DET-007 | Tags input | `qa, frontend, ünïcödé` → split into an array on submit | PASS |
| CUSTOMERS-DET-008 | Notes textarea | Emoji accepted | PASS |
| CUSTOMERS-DET-009 | "Tax exempt" checkbox | Toggles | PASS |
| CUSTOMERS-DET-010 | "Accepts marketing" checkbox | Toggles | PASS |
| CUSTOMERS-DET-011 | "Save changes" | `PUT → 200`, badge and fields reflect the save | PASS |
| CUSTOMERS-DET-012 | Addresses table | Empty state "No addresses on file."; then the real row | PASS |
| CUSTOMERS-DET-013 | "Add address" | Opens the dialog | PASS |
| CUSTOMERS-DET-014 | Address dialog: 4 required fields | Empty submit → 4 inline errors (recipientName, addressLine1, city, postalCode) | PASS (message quality BUG-FE-013) |
| CUSTOMERS-DET-015 | Address dialog: phone | `12345` → "Must be E.164 format, e.g. +919876543210" — a genuinely actionable message, in contrast to CUSTOMERS-NEW-005 | PASS |
| CUSTOMERS-DET-016 | Address dialog: country code | `maxLength=2`, defaults `IN` | PASS |
| CUSTOMERS-DET-017 | Address dialog: type select | 3 options, default `BOTH` | PASS |
| CUSTOMERS-DET-018 | Address dialog: default ship/bill checkboxes | Toggle | PASS |
| CUSTOMERS-DET-019 | Address dialog "Save" | `POST …/addresses` → dialog closes, row appears with correct data | PASS |
| CUSTOMERS-DET-020 | Row "Edit" → prefilled dialog | Prefill correct; changing city to `Mysuru` → `PUT` → table updated | PASS |
| CUSTOMERS-DET-021 | Row "Delete" → dialog | "Never mind" keeps it; "Delete" → `DELETE` → back to the empty state | PASS |
| CUSTOMERS-DET-022 | "Add product" (wishlist) | Opens "Add to wishlist" | PASS |
| CUSTOMERS-DET-023 | Wishlist search | Searching `Aeron` returns 5 products, **none of them the Aeron chair**; `ZZZNOMATCHATALL` returns the same 5. The product is unfindable | **FAIL** (BUG-FE-002) |
| CUSTOMERS-DET-024 | Wishlist add / "Remove" | Selecting a result → `POST …/wishlist` → row with date; "Remove" → `DELETE` → "Nothing wishlisted yet." | PASS |
| — | Invalid id in URL | `/customers/NOTAREALID` → "This customer could not be found." | PASS |

Permission gating (`customer:update`) covers the profile fields, the Save row, "Add address", the address Edit/Delete buttons and column, "Add product" and the wishlist Remove — verified by source; the owner path was exercised live.

---

## 7. Storefront — `http://northwind.ems.localhost:3001`

### 7.1 Site header / footer — SFHDR-001 … 006

| ID | Element | Test | Status |
|---|---|---|---|
| SFHDR-001 | Store-name link → `/` | Renders the real tenant name "Northwind Main Store" | PASS |
| SFHDR-002 | "All products" nav link | → `/products` | PASS |
| SFHDR-003 | Header search input | Present with `aria-label="Search products"` | PASS |
| SFHDR-004 | Header search submit | Pushes `/products?q=…`; the server returns the correctly filtered result set | PASS |
| SFHDR-005 | Cart link + badge | `aria-label` tracks the real count: "Cart, 0 items" → "Cart, 3 items" → "Cart, 4 items" → "Cart, 1 item" (correct singular) → "Cart, 0 items" after checkout | PASS |
| SFHDR-006 | Footer links ("All products", "Cart") | Correct routes; `© {year} {name}. All prices in INR.` | PASS |

### 7.2 Home — `/` — SFHOME-001 … 005

| ID | Element | Test | Status |
|---|---|---|---|
| SFHOME-001 | "Browse all products" CTA | → `/products` | PASS |
| SFHOME-002 | Featured grid | Real featured products with names and prices | PASS |
| SFHOME-003 | Product cards | Each card is one link → `/products/{slug}`; sale badge ("13% off") and star rating with count render correctly | PASS |
| SFHOME-004 | "View all" link | → `/products` | PASS |
| SFHOME-005 | Empty / error states | Not triggered (catalogue is populated and the API was healthy) | NOT TESTED |

Mobile 375px: no document overflow, 2-column grid, full-width search. PASS.
Console errors on load: none. PASS.

### 7.3 Catalogue — `/products` — SFCAT-001 … 008

| ID | Element | Test | Status |
|---|---|---|---|
| SFCAT-001 | Page render | The Suspense boundary never resolves in the browser: the skeleton stays and the real markup sits in a `body > div[hidden]`, with no console error | **FAIL** (BUG-FE-003) |
| SFCAT-002 | Search input | In the DOM but non-interactive | BLOCKED (BUG-FE-003) |
| SFCAT-003 | "Clear search" button | Non-interactive | BLOCKED |
| SFCAT-004 | Sort select | 5 options present in the markup; non-interactive | BLOCKED |
| SFCAT-005 | Search behaviour (server) | `/products?q=chair` server HTML contains "Aeron Mesh Desk Chair" and "Results for"; API `q=chair` → 1 result, `q=ZZZNOMATCH` → 0. **Storefront search works correctly** (unlike the console) | PASS |
| SFCAT-006 | Sort behaviour (API) | `sort=priceMinor` → cheapest first; `sort=-priceMinor` → dearest first | PASS |
| SFCAT-007 | Pagination | 16 products at page size 12 → 2 pages; `buildHref` omits `page=1` | PASS (by API/HTML) |
| SFCAT-008 | Loading skeleton | `products/loading.tsx` renders with `sr-only role="status" "Loading products"` | PASS |

### 7.4 Product detail — `/products/[slug]` — SFPD-001 … 013

| ID | Element | Test | Status |
|---|---|---|---|
| SFPD-001 | Page render | Same hydration failure as the catalogue | **FAIL** (BUG-FE-003) |
| SFPD-002 | Breadcrumb links (Home / Products) | Present in markup | BLOCKED |
| SFPD-003 | Star-rating anchor → `#reviews` | Present | BLOCKED |
| SFPD-004 | Quantity "−" | Present, non-interactive | BLOCKED |
| SFPD-005 | Quantity input | Present, non-interactive | BLOCKED |
| SFPD-006 | Quantity "+" | Present, non-interactive | BLOCKED |
| SFPD-007 | "Add to cart · ₹21,499.00" | Clicking it changes nothing: no label change, no cart id written, badge stays "Cart, 0 items" — React handlers are not attached | **FAIL** (BUG-FE-003) |
| SFPD-008 | "View cart" post-add link | Unreachable | BLOCKED |
| SFPD-009 | Review form (rating picker, title, body, author, submit) | Present in markup; non-interactive | BLOCKED |
| SFPD-010 | "Helpful" vote | UI blocked; API `POST /storefront/reviews/{id}/helpful → 204` | PASS (API) |
| SFPD-011 | Review submission (API) | `rating:9` → 422 "less than or equal to 5"; `rating:0` → 422 "greater than or equal to 1"; valid → `201` with `status: PENDING` | PASS (API) |
| SFPD-012 | "Specifications" section | — | NOT TESTED |
| SFPD-013 | `not-found.tsx` | A bad slug renders "We could not find that product" + "Browse all products" | PASS |

**Cross-surface review flow (the one the mandate asked for), all real:**
storefront `POST /storefront/reviews` → `PENDING`; public list still `total 0` (pending correctly
hidden); console `GET /console/reviews?status=PENDING` as `owner@northwind.test` **includes** it;
`POST /console/reviews/{id}/moderate {APPROVED}` → `201 APPROVED`; `POST …/reply` → `201`;
public list now `total 1` with the merchant reply and the emoji body intact. **PASS.**
Note: the catalogue's cached rating lagged the detail page by one cache TTL and then caught up
(0.00/0 → 5.00/1) — expected caching behaviour, deliberately **not** filed as a bug.

### 7.5 Cart — `/cart` — SFCART-001 … 012

| ID | Element | Test | Status |
|---|---|---|---|
| SFCART-001 | Page render + hydration | Renders and hydrates correctly (no `loading.tsx` on this route) | PASS |
| SFCART-002 | Empty state | "Your cart is empty" + "Browse products" link | PASS |
| SFCART-003 | Line items | `Laptop Riser ×2 = ₹5,598.00` with "₹2,799.00 each"; `Test Widget ×1 = ₹199.99` with **no** "each" line (correct, qty 1) | PASS |
| SFCART-004 | Quantity "+" | 1 → 2: line ₹399.98, subtotal 5,598.00 + 399.98 = **₹5,997.98**, badge 3 → 4 items. Exact | PASS |
| SFCART-005 | Quantity "−" | 2 → 1: line ₹199.99, "each" line removed, subtotal back to ₹5,797.99 | PASS |
| SFCART-006 | Remove line | Laptop Riser removed → subtotal ₹199.99, badge "Cart, 1 item" | PASS |
| SFCART-007 | Coupon input | Auto-uppercases every keystroke (`qa-not-real-code` → `QA-NOT-REAL-CODE`), `maxLength=64` | PASS |
| SFCART-008 | "Apply" disabled when empty | `disabled` with an empty box | PASS |
| SFCART-009 | Apply invalid coupon | "Coupon 'QA-NOT-REAL-CODE' is not valid"; the typed code is **retained** for correction | PASS |
| SFCART-010 | Apply valid coupon | `SAVE10` → "SAVE10 applied", `Discount (SAVE10) − ₹599.80`, total ₹5,398.18. 10% of 5,997.98 = 599.798 → ₹599.80, and 5,997.98 − 599.80 = 5,398.18. Exact | PASS |
| SFCART-011 | Remove coupon | Discount row disappears, total returns to ₹5,997.98 | PASS |
| SFCART-012 | "Proceed to checkout" / "Continue shopping" | Correct routes | PASS |

Order-summary rules verified: Shipping renders the literal "Free" at zero; Discount and Tax rows are hidden when zero; Total always shown. PASS.
Mobile 375px: no element overflows (`0` overflowing leaves measured against `innerWidth`). The apparent right-edge clipping in a screenshot was a viewport-emulation artifact (layout computed at 411px, frame captured at 375px), **not** an app defect. Tap targets are undersized — BUG-FE-020 (P3).

### 7.6 Checkout — `/checkout` — SFCO-001 … 019

| ID | Element | Test | Status |
|---|---|---|---|
| SFCO-001 | Empty-cart state | "There is nothing to check out" + "Browse products" | PASS |
| SFCO-002 | Email input | `notanemail` → "Enter a valid email address"; blank allowed | PASS |
| SFCO-003 | Phone input | `12345` → "Use the international format, e.g. +919876543210"; blank allowed | PASS |
| SFCO-004 | "Full name" (required) | Empty → "Who should we deliver to?"; whitespace-only → same; 250 chars → "at most 200" (raw Zod, the only such leak on this form) | PASS |
| SFCO-005 | "Address" (required) | Empty / whitespace → "Enter the street address" | PASS |
| SFCO-006 | "Apartment, floor" | Optional | PASS |
| SFCO-007 | "Landmark" | Optional | PASS |
| SFCO-008 | "City" (required) | Empty / whitespace → "Enter the city" | PASS |
| SFCO-009 | "Postal code" (required) | Empty / whitespace → "Enter the postal code" | PASS |
| SFCO-010 | "State" / "State code" | Optional; `maxLength=10` on the code | PASS |
| SFCO-011 | "Country" (required) | `X` → "Use the two-letter country code"; `maxLength=2`, defaults `IN` | PASS |
| SFCO-012 | "Delivery notes" | Optional textarea | PASS |
| SFCO-013 | COD radio | The only payment option; the "card and online methods are not enabled" footnote renders | PASS |
| SFCO-014 | Live pricing | Once the required address fields were complete, the debounced `POST /checkout/pricing` fired and Shipping changed "Free" → **₹50.00**, total → ₹249.99, and the disclaimer switched to "Shipping and tax calculated for your address." | PASS |
| SFCO-015 | Order summary | Read-only line items with Qty and line totals | PASS |
| SFCO-016 | "Place order" loading state | The button is `disabled` during submit — real double-submit guard | PASS |
| SFCO-017 | Order placement | `POST /checkout/orders` → `201 ORD-000023`; cart id cleared from `localStorage`, badge → "Cart, 0 items", `/cart` shows the empty state | PASS |
| SFCO-018 | Total shown vs total charged | Checkout displayed **₹249.99**; the confirmation and the order both say **₹279.99** — a ₹30.00 gap, exactly the COD fee, which the pricing endpoint cannot quote | **FAIL** (BUG-FE-011) |
| SFCO-019 | Idempotency | Replaying the same `Idempotency-Key` returned the **same** order (`ORD-000020`) — no duplicate created | PASS |
| — | "Back to cart" link | Correct route | PASS |

Server-side address validation independently confirmed: blank `recipientName` / `city` / `postalCode` and `countryCode: "INDIA"` each return a field-scoped `422`. PASS.
Mobile 375px: 4 sections stack, inputs full-width, "Place order" 353×48. No overflow. PASS.

### 7.7 Confirmation — `/checkout/confirmation` — SFCONF-001 … 004

| ID | Element | Test | Status |
|---|---|---|---|
| SFCONF-001 | Receipt render | "Order confirmed", order number `ORD-000023`, Total ₹279.99, Payment "Due on delivery" | PASS |
| SFCONF-002 | Refresh persistence | A full reload re-renders the same receipt from `sessionStorage` | PASS |
| SFCONF-003 | "Payment pending" card | Correctly **not** shown for COD (`payment` is null) | PASS |
| SFCONF-004 | "Continue shopping" link | → `/products` | PASS |

Fallback render (no stored order) — NOT TESTED (would require clearing `sessionStorage`; the
happy path and the refresh path both verified).

---

## 8. Verticals with no frontend — NOT IMPLEMENTED

Backend modules exist for each of these, but there is **no console page**, so there are no
elements to inventory or test. Listed for completeness, as required, not skipped silently:

Categories · Brands · Gift Cards · Loyalty · Payments (reconciliation) · Shipping · CMS/Blog ·
Themes · Analytics · **Support tickets** · Staff & Roles/Permissions management · Notification
settings · Billing/Subscription · Marketplace · Channels · Domains · Banners · Menus · SEO
settings · Warehouses (create/edit) · Reviews moderation · Returns/Refunds · Media upload ·
Product variants editor · Tax classes/rates.

**All NOT IMPLEMENTED on the frontend.** Two consequences worth flagging:
- Brands and Categories can only be created outside the console, yet the product form has
  pickers for both — the Brand picker is permanently empty in northwind.
- Review moderation (§7.4) and warehouse creation (INVDET-016) had to be done through the API
  because no UI exists.

Storefront gaps re-confirmed as NOT IMPLEMENTED: customer registration/login, order history
or lookup, category/brand navigation, wishlist UI.

---

## 9. Cross-cutting checks

| Check | Result |
|---|---|
| Console errors on page load | Clean on every console page as `owner@northwind.test`. The only errors seen were the pre-login `403`/`401` from a stale token before signing in, and the documented queue-Redis `ECONNREFUSED 127.0.0.1:6380` in the API log. Storefront: no console errors on any page, **including** the pages that fail to hydrate (BUG-FE-003 is silent). |
| Failed network requests | None unexpected. The API dev server hot-restarted once mid-run (PID 17672 → 1936), producing transient `ERR_CONNECTION_REFUSED`; the affected page recovered on its own and rendered its real error state. |
| Browser back / forward / refresh | Verified on `/products` (with `?page=2`), `/orders`, `/customers` and `/checkout/confirmation`. Sane throughout. Filters held in React state are dropped from the URL on pagination — recorded, not filed. |
| Invalid id in URL | `/products/NOTAREALID`, `/orders/NOTAREALID`, `/customers/NOTAREALID`, `/coupons/<bogus>` all render a real "could not be found" alert. No blank page and no crash anywhere. PASS. |
| Mobile 375px | Dashboard, Products list, Storefront home, Cart and Checkout all measured: **no document-level horizontal overflow anywhere**. Nav scrolls within itself; wide tables scroll within their own wrapper; product-list row heights uniform. The two bugs fixed earlier in the session have **not** regressed. One new P3: undersized tap targets on the mobile cart (BUG-FE-020). |
| Keyboard — form | Product create: autofocus correct, Tab order matches visual order across all 13 focusables, no tabindex traps, `:focus-visible` matches on real Tab and paints a clearly visible ring. PASS. |
| Keyboard — modal | Products delete dialog: focus moves inside on open (lands on Cancel), the focus trap holds through 7 Tabs, Escape closes it (verified with a real `keydown`), and the ring is visible. PASS. One P3: the dialog does not set `aria-modal` (BUG-FE-021). |
| Permission-gated destructive actions | Verified against `ops@northwind.test` (ORDER_MANAGER, 22 permissions): Products list "New product", "Edit", "Delete" and "Publish" all **absent**; Product edit — every field `disabled` and "Save changes" **not rendered**; Customers "New customer" **absent**. That is 6 destructive/mutating affordances correctly withheld across 3 pages, exceeding the 2–3 asked for. PASS. |

---

## 10. QA data created in this phase

All prefixed `QA-FE` and safe to delete. Created through the real API/UI only — no direct DB writes.

**northwind:**
- Products: `QA-FE Edit Target (renamed)` / `QA-FE-EDIT-001` (ACTIVE, ₹777.77, stock 25 in Main Warehouse, reorder point 10, bin `QA-BIN-01`). `QA-FE Ünïcödé Wîdget 🧪🚀 日本語` / `QA-FE-SKU-001` was created, published and then **deleted** as part of the delete-modal test.
- Customer: `QA-FE Ünïcödé Tëstér 🧪` / `qa-fe-customer@qa.test` (status `BLOCKED`, group `QA-VIP`, tags `qa, frontend, ünïcödé`). Its address and wishlist entry were created and then deleted during testing.
- Orders: `ORD-000020` (COMPLETED — hold/resume/fulfil/close lifecycle test), `ORD-000021` (CANCELLED — cancel test), `ORD-000022` (over-100% coupon test), `ORD-000023` (checkout UI test).
- Review on `Laptop Riser — Aluminium`: 5★ "QA-FE excellent riser", APPROVED, with merchant reply "QA-FE merchant reply — thanks!" and 1 helpful vote. **This changed a real product's public rating from no reviews to 5.00 (1).**
- Coupon `QA-FE-OVER100` was created and then **deleted**.
- Carts `01M1ZG42…`, `01M1ZH4SZ…`, `01M1ZHJHC…` (Redis, expire on their own).
- Stock: `Test Widget` went 13 → 12 on hand because `ORD-000022` consumed one unit.
- One of my own login sessions was revoked during the Sessions test (session count 71 → 70).

**Nothing belonging to earlier phases was modified.** The `SAVE10` and `QA-RBAC-*` coupons were
applied to carts for validation only and then removed before any order was placed, so no
other phase's coupon usage counter was incremented. `QA-Northwind Sacrificial *`, the real
seeded products/orders/customers and all `lakeside` data were left untouched.

---

## 11. Verdict

The console's **data-entry and mutation paths are solid**: every create, update, delete,
publish and order state transition tested landed correctly in the database, every money
calculation checked was arithmetically exact to the paisa, all 8 modals behave correctly on
Cancel/X/Escape/outside-click, pagination moves real data, and permission gating genuinely
withholds destructive affordances from a narrower role.

Three things stand between this and a releasable frontend:

1. **Nobody who is not already signed in can use the auth pages** (BUG-FE-001) — password
   reset, email verification and staff invitation acceptance are all unreachable.
2. **Console search is inert everywhere it appears** (BUG-FE-002), and in the wishlist and
   inventory pickers that makes a specific product genuinely unfindable.
3. **Two storefront routes never hydrate** (BUG-FE-003), so the catalogue and product pages
   cannot be browsed or added to a cart in this environment.

Below those, the recurring theme is **error suppression**: a 403 or a 422 on a field the form
does not render produces silence — an empty table, or a button that does nothing. That single
pattern accounts for BUG-FE-004, 005, 006, 007, 008 and 009.
