# EMS — Bug Report (QA Phases 3 + 4: Frontend)

**Phase:** 3 (element inventory) + 4 (frontend functional testing)
**Executed:** 2026-09-08, live against the running dev stack
**Environment:** Console `http://localhost:3000` · Storefront `http://northwind.ems.localhost:3001` · API `http://localhost:4000/api/v1` · MySQL `127.0.0.1:3307` db `ems`
**Element coverage:** `FRONTEND_ELEMENT_COVERAGE.md`
**Security/RBAC findings:** `SECURITY_REPORT.md`, `PERMISSION_MATRIX.md` (SEC-001 is closed — not re-tested here)

Nothing in this file was fixed. Every entry was reproduced live with the evidence shown.

---

## 0. Summary

| Severity | Count | IDs |
|---|---|---|
| **P0** | **0** | — |
| **P1** | **3** | BUG-FE-001, BUG-FE-002, BUG-FE-003 |
| **P2** | **9** | BUG-FE-004 … BUG-FE-012 |
| **P3** | **10** | BUG-FE-013 … BUG-FE-022 |
| **Total** | **22** | |

**No P0.** Nothing found here corrupts data, leaks across tenants, or breaks payment: every
money figure checked was exact to the paisa, and every order state transition persisted
correctly. The one pricing discrepancy (BUG-FE-011) is a known, disclosed, fixed-value COD fee,
not a miscalculation.

**Severity bar used** (same as the Security phase): P0 = data corruption, security, or a broken
checkout/payment path. P1 = a core task cannot be completed. P2 = a feature is partially broken
or validation is wrong. P3 = visual, wording, or minor UX.

**Six of the nine P2s share one root cause** — an API error, or a validation error attached to a
field the form does not render, produces *silence*: an empty table, or a button that does
nothing. Fixing that pattern once addresses BUG-FE-004, 005, 006, 007, 008 and 009.

### Confirmations of previously-open findings

| Prior ID | Now | Note |
|---|---|---|
| KF-08 (open, P2) | **Confirmed live** as BUG-FE-011, with exact figures from the UI (₹249.99 shown, ₹279.99 charged) |
| KF-07 (open, P2) | Not re-tested here — it is a contract/id issue with no frontend symptom found in this pass |
| SEC-005 (P3) | Not re-tested — `inventory/levels?warehouseId` has no UI control that sets it |

---

## BUG-FE-001 — Every auth page except `/login` bounces an unauthenticated visitor to `/login`, making password reset, email verification and invitation acceptance unreachable

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-001 |
| **Severity** | **P1** — three core onboarding/recovery workflows cannot be completed by anyone. The affected pages exist *only* for unauthenticated people, which is precisely the case that fails. |
| **Module** | Console auth (`apps/console/src/hooks/use-auth.tsx`) |
| **Page** | `/forgot-password`, `/reset-password`, `/verify-email`, `/accept-invite` (all 4 of the 5 auth pages) |
| **Environment** | Console `http://localhost:3000`, 2026-09-08 |
| **User** | Any visitor who is **not** signed in — i.e. every real user of these pages |
| **Tenant** | Any (tenant-independent) |
| **Precondition** | No valid session. Clear `localStorage` / sign out first. |

**Steps to Reproduce**

1. Sign out of the console (or open a clean profile) so no session exists.
2. Navigate to `http://localhost:3000/forgot-password`.
3. Observe the URL and the rendered page.
4. Repeat with `/reset-password?token=<anything>`, `/verify-email?token=<anything>`, `/accept-invite?token=<anything>`.

**Expected Result**

Each page renders its own content: the forgot-password form, the choose-a-new-password form (or
its "Link not valid" state), the verification result, the invitation form (or its "Invitation not
valid" state). These pages are the entry points from emailed links and must work with no session.

**Actual Result**

All four immediately redirect to `/login`, discarding the token. The page's own error and form
states are never reachable.

**Evidence**

```
signed out; localStorage empty (Object.keys(localStorage) -> [])

GET /forgot-password                          -> browser ends on /login, h1 "Sign in"
GET /reset-password?token=QA-FE-BOGUS-...     -> /login
GET /verify-email?token=QA-FE-BOGUS-...       -> /login
GET /accept-invite?token=QA-FE-BOGUS-...      -> /login
```

The same URLs render correctly **while signed in**, which is what masks the bug in casual testing:

```
signed in as owner@northwind.test:
GET /reset-password   -> "Link not valid — This reset link is missing its token."   (correct)
GET /verify-email     -> "Verification failed — This verification link is missing its token."  (correct)
GET /accept-invite    -> "Invitation not valid — … invalid, already used, revoked, or expired."  (correct)
GET /forgot-password  -> the form, and it works end to end (see BUG-FE-013 for its wording)
```

The server is not redirecting — this is purely client-side:

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/verify-email                     -> 200
$ curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/verify-email?token=QA-FE-BOGUS" -> 200
$ curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/accept-invite?token=QA-FE-BOGUS" -> 200
$ curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/reset-password?token=QA-FE-BOGUS" -> 200
   (no Location header on any of them; no middleware.ts exists in apps/console)
```

**Console Error** — none. The redirect is silent.

**Network Error**

```
POST http://localhost:4000/api/v1/auth/refresh      -> 401 Unauthorized   (fires on every auth page load)
POST http://localhost:4000/api/v1/auth/verify-email -> 401 Unauthorized   (verify-email additionally fires its own call)
```

**API** — `POST /api/v1/auth/refresh` (the session bootstrap), `POST /api/v1/auth/verify-email`.

**Request**

```http
POST /api/v1/auth/refresh HTTP/1.1
Host: localhost:4000
(no refresh cookie / no session)
```

**Response**

```
401 Unauthorized
```

**Root Cause**

`apps/console/src/hooks/use-auth.tsx` (bootstrap effect, ~lines 84–95). The mount-only bootstrap
always attempts a silent refresh, and the global unauthenticated handler it installs exempts only
`/login`:

```ts
setUnauthenticatedHandler(() => {
  clearSession();
  // Only redirect if not already on an auth page, otherwise a failed refresh on the
  // login page bounces the user in a loop.
  if (!window.location.pathname.startsWith('/login')) {
    router.replace('/login');
  }
});
```

The comment states the correct intent — *"if not already on an auth page"* — but the condition
only tests `/login`. Since `POST /auth/refresh` returns `401` for every visitor without a
session, the handler fires on `/forgot-password`, `/reset-password`, `/verify-email` and
`/accept-invite` and navigates away. `verify-email` is hit twice: its own `POST /auth/verify-email`
also 401s through the same handler, so even a *valid* token would be redirected away before the
result could render.

**Suggested Fix**

Exempt the whole `(auth)` route group rather than one path, e.g.

```ts
const AUTH_PATHS = ['/login', '/forgot-password', '/reset-password', '/verify-email', '/accept-invite'];
if (!AUTH_PATHS.some((p) => window.location.pathname.startsWith(p))) {
  router.replace('/login');
}
```

Two further hardening points worth taking at the same time: (a) the bootstrap refresh should not
run at all under the `(auth)` layout, since no page there needs a session; and (b) the
`verify-email` / `accept-invite` calls are public endpoints and their `401`s should be handled
locally by those pages rather than escalated to the global unauthenticated handler.

**Retest Status** — NOT RETESTED (no fix applied in this phase).

---

## BUG-FE-002 — The `q` search parameter is silently ignored by every console list endpoint; three console search boxes return unfiltered results

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-002 |
| **Severity** | **P1** — the search box is inert on the catalogue, and in the wishlist and inventory pickers (which show only the top 5 rows and have no pagination) a specific product is genuinely unfindable. It also returns *wrong* results silently rather than failing, so a merchant has no signal that search is broken. |
| **Module** | Product/Customer/Coupon/Order/Review list services (API) + the console UIs that offer search |
| **Page** | `/products` (search box + "Search" button) · `/customers/[id]` → "Add to wishlist" dialog · `/inventory` ("Find a product") |
| **Environment** | As above, 2026-09-08 |
| **User** | `owner@northwind.test` (STORE_OWNER, 160 permissions) |
| **Tenant** | `northwind` |
| **Precondition** | More than a handful of products exist (northwind has 29). |

**Steps to Reproduce**

1. Sign in as `owner@northwind.test`, go to `/products`.
2. Type `QA-FE` into "Search by name or SKU…" and press "Search".
3. Observe the row count and the rows themselves.
4. Type `ZZZNOMATCH` and press "Search" again.
5. Go to a customer detail page → "Add product" (wishlist) → type `Aeron`.
6. Go to `/inventory` → "Find a product" → type `ZZZNOMATCH`.

**Expected Result**

Step 2/3: only products whose name or SKU matches `QA-FE`. Step 4: the empty state
("No products match these filters."). Step 5: "Aeron Mesh Desk Chair". Step 6: no results.

**Actual Result**

The request fires with the term and returns `200`, but the result set is **completely
unfiltered** in every case.

**Evidence**

Products list — the request is correct, the response is not:

```
GET /api/v1/console/products?page=1&limit=20&q=QA-FE&storeId=01M1W1MAYS... -> 200 OK
   table still shows all 29 products (QA-Northwind Sacrificial Probe B, Laptop Riser, ...)
```

Measured directly against the API, `total` never changes:

```
page=1&limit=20                  => 200 total 29
page=1&limit=20&q=QA-FE          => 200 total 29     <-- should be 2
page=1&limit=20&q=ZZZNOMATCH     => 200 total 29     <-- should be 0
page=1&limit=20&search=QA-FE     => 200 total 29     (alternate param name, also ignored)
page=1&limit=20&status=DRAFT     => 200 total 14     <-- status DOES filter, so the pipeline works
```

Systemic across every console list endpoint:

```
/console/customers   no-q: total=2   | q=ZZZNOMATCH: total=2
/console/coupons     no-q: total=16  | q=ZZZNOMATCH: total=16
/console/orders      no-q: total=19  | q=ZZZNOMATCH: total=19
/console/reviews     no-q: total=35  | q=ZZZNOMATCH: total=35
```

Wishlist picker — the sharpest user-visible impact (`limit: 5`, no pagination):

```
search "Aeron"            -> QA-FE Edit Target (renamed) | QA-Northwind Sacrificial Probe B |
                             QA-Northwind Sacrificial Probe A | Laptop Riser — Aluminium |
                             Acoustic Desk Divider Panel
                             (the Aeron Mesh Desk Chair is NOT among them)
search "ZZZNOMATCHATALL"  -> the identical five products
```

Inventory "Find a product":

```
search "ZZZNOMATCH" -> QA-FE Edit Target (renamed), QA-Northwind Sacrificial Probe B,
                       QA-Northwind Sacrificial Probe A, Laptop Riser — Aluminium,
                       Acoustic Desk Divider Panel, Test Widget
```

For contrast, the **storefront's** own search is implemented and works correctly, which
confirms this is a defect rather than an unbuilt feature:

```
GET /storefront/products?limit=50&q=chair       -> 200 total 1  (Aeron Mesh Desk Chair)
GET /storefront/products?limit=50&q=ZZZNOMATCH  -> 200 total 0
```

**Console Error** — none.
**Network Error** — none; the requests succeed with `200`. That is the bug.

**API**

```
GET /api/v1/console/products      (q ignored)
GET /api/v1/console/customers     (q ignored)
GET /api/v1/console/coupons       (q ignored)
GET /api/v1/console/orders        (q ignored)
GET /api/v1/console/reviews       (q ignored)
```

**Request**

```http
GET /api/v1/console/products?page=1&limit=20&q=ZZZNOMATCH&storeId=01M1W1MAYS3746WD70SB4ZZPGA HTTP/1.1
Host: localhost:4000
Authorization: Bearer <owner@northwind.test>
```

**Response** — `200 OK`, `meta.pagination.total: 29` (every product in the tenant).

**Root Cause**

Two layers, both missing the term:

1. `packages/contracts/src/common/pagination.ts:111-113` — `listQuerySchema` merges
   `searchQuerySchema`, so `q` is an **accepted and validated** query parameter. Nothing rejects
   it, which is why the caller gets a `200`.
2. `apps/api/src/modules/product/product.service.ts:33-53` — `list()` builds the filter object
   and **never forwards `query.q`**:

   ```ts
   const { items, total } = await this.products.listing(
     {
       storeId: storeId ?? undefined,
       status: query.status,
       visibility: query.visibility,
       type: query.type,
       brandId: brandId ?? undefined,
       categoryId: categoryId ?? undefined,
       isFeatured: query.isFeatured,
     },            // <-- no q / search
     query.sort, (query.page - 1) * query.limit, query.limit,
   );
   ```
3. `apps/api/src/modules/product/product.repository.ts:72-92` — `listing()` has **no search
   predicate at all**. There is no `name LIKE` / `sku LIKE` clause to forward it to, so this is
   not merely an unwired parameter: the capability is absent from the repository.

The same shape holds for customers, coupons, orders and reviews.

**Suggested Fix**

Add a search predicate to `ProductListFilter` and `ProductRepository.listing()` —
`qb.andWhere('(p.name LIKE :q OR p.sku LIKE :q)', { q: `%${term}%` })` — and forward `query.q`
from `ProductService.list()`. Repeat for the customer, coupon, order and review repositories.
Since `q` is already in the shared `listQuerySchema`, a `test/unit` guard asserting that any
service accepting `listQuerySchema` actually consumes `q` would stop this recurring.

Until it is fixed, the honest interim option is to hide the three search inputs, since a search
box that silently returns everything is worse than none.

**Retest Status** — NOT RETESTED.

---

## BUG-FE-003 — Storefront routes under `/products` never resolve their Suspense boundary: the page stays on the loading skeleton and is completely non-interactive

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-003 |
| **Severity** | **P1** — the catalogue and every product page cannot be browsed or added to a cart. Reduced from P0 only because the checkout path itself is intact (a cart created by any other means completes an order correctly) and because the defect may be dev-server-specific — see *Caveat*. |
| **Module** | Storefront app router (`apps/storefront/src/app/products/*`) |
| **Page** | `/products` (catalogue) and `/products/[slug]` (product detail) — every route under `/products` |
| **Environment** | Storefront `http://northwind.ems.localhost:3001` (Next.js 15.5.22 dev server, React 19), 2026-09-08 |
| **User** | Anonymous shopper |
| **Tenant** | `northwind` (also affects any tenant — the route, not the data) |
| **Precondition** | None. |

**Steps to Reproduce**

1. Open `http://northwind.ems.localhost:3001/products`.
2. Wait 10 seconds or more.
3. Inspect `document.querySelector('main').innerText`.
4. Open `http://northwind.ems.localhost:3001/products/aeron-mesh-desk-chair` and repeat.
5. Click "Add to cart".

**Expected Result**

The skeleton is replaced by the product grid / product detail, and the interactive components
(search, sort, quantity stepper, "Add to cart", review form) work.

**Actual Result**

`<main>` contains only the loading skeleton, indefinitely. The real markup **is** in the DOM but
parked in a `hidden` staging `<div>` directly under `<body>`, and React never reveals it. No
handlers are attached, so every control is inert.

**Evidence**

Catalogue, after a fresh navigation plus a 10s wait and a full reload:

```js
{ title: "Search: chair · Northwind Main Store",
  h1: ["Results for “chair”"],                       // the real content EXISTS
  productLinks: ["/products/aeron-mesh-desk-chair"], // and is correct
  mainText: "Loading products",                      // but <main> still shows the skeleton
  mainHTMLlen: 2783,
  hasSkeleton: true,
  srStatus: ["Loading products"],
  readyState: "complete",
  bodyLen: 79339 }
```

The content is outside `<main>`, in React's hidden streaming buffer:

```js
{ mainCount: 1,
  mainInfo: [{ len: 2783, text: "Loading products" }],
  h1Parent: "OUTSIDE main",
  h1ParentChain: ["H1", "HEADER", "DIV", "DIV[hidden]", "BODY", "HTML"],
  templates: 1 }
```

Product detail — the interactive components exist but are unreachable:

```js
{ mainText: "Loading products",
  hiddenDivs: 2,
  allButtons: ["Decrease quantity", "Increase quantity", "Add to cart · ₹21,499.00",
               "1 star","2 stars","3 stars","4 stars","5 stars","Submit review"] }
```

Clicking "Add to cart" does nothing at all — React handlers are not attached:

```js
btn.click(); // wait 4s
{ btnLabelNow: "Add to cart · ₹21,499.00",   // never becomes "Added to cart"
  cartLink: "Cart, 0 items",                 // badge unchanged
  lsKeys: [] }                               // no cart id written to localStorage
```

The server side is healthy — it renders and returns the correct content:

```
storefront dev log:  GET /products?q=chair  200 in 2364ms

$ curl -s "http://northwind.ems.localhost:3001/products?q=chair" | grep -o "Aeron Mesh Desk Chair" | wc -l
4
$ curl -s "http://northwind.ems.localhost:3001/products" | grep -o "All products" | wc -l
7
```

Scope — only routes with a `loading.tsx` are affected. `/` (home), `/cart`, `/checkout` and
`/checkout/confirmation` have no `loading.tsx`, and all four render **and hydrate correctly**
(the cart's quantity buttons, coupon box and the whole checkout form were exercised
successfully — see `FRONTEND_ELEMENT_COVERAGE.md` §7.5–7.6). `apps/storefront/src/app/products/loading.tsx`
sits above both `/products` and `/products/[slug]`, exactly matching the affected set.

**Console Error** — **none.** No hydration warning, no error boundary, nothing. The failure is
entirely silent, which is what makes it dangerous.

**Network Error** — none. All document and chunk requests return `200`.

**API** — n/a; the API returns correct data and the server-rendered HTML contains it.

**Request / Response** — `GET http://northwind.ems.localhost:3001/products?q=chair` → `200`, HTML
containing both the skeleton and the real grid (normal streamed-Suspense output).

**Root Cause**

Not fully diagnosed. The observable facts: the server streams the shell (skeleton) and then the
boundary content; the boundary content lands in the `hidden` staging div; the inline script that
should swap it into `<main>` and complete hydration never takes effect; and no error is raised.
It is confined to the subtree under `apps/storefront/src/app/products/loading.tsx`.

**Update 2026-09-08 — reproduced against a clean production build; this is confirmed as a real
defect, not a dev-server/HMR artifact.**

Ran `npx next build` (clean, `.next` removed first — ruled out a stale cache) then
`npx next start --port 3002`, and opened `http://northwind.ems.localhost:3002/products` cold, on
the very first request of a freshly started process. It reproduced immediately — no "works on the
first load" grace period this time, which the original dev-server observation suggested might
exist. This rules out both candidate explanations in the original caveat (dev-server streaming and
HMR): there is no HMR in `next start`, and the failure is now the *first*-load behavior, not
something that develops after a few navigations.

**Root cause, now precisely identified** by reading React's own streaming markers in the served
HTML rather than guessing. Every Suspense boundary React streams gets a `hidden` placeholder div
tagged with a segment id (`S:n`), and a same-page inline script calls `$RC("B:n","S:n")` or
`$RS("S:n","P:n")` to reveal it once its content is ready:

```js
// Extracted from the live page via document.querySelectorAll('script:not([src])')
revealCalls: ["$RS(\"S:3\",\"P:3\")", "$RS(\"S:4\",\"P:4\")", ..., "$RS(\"S:13\",\"P:13\")",
              "$RC(\"B:14\",\"S:14\")", "$RC(\"B:0\",\"S:0\")"]
hiddenDivs:  [{id:""}, {id:"S:1", textPreview:"All products16 productsSort by..."},
              {id:"S:14"}, {id:"S:0"}]
```

**`S:1` — the boundary holding the actual product grid — has real, fully server-rendered content
sitting in its `hidden` div, but no `$RC`/`$RS` call anywhere in the document ever references
`S:1`.** Every other boundary in the stream (`S:0`, `S:3`–`S:14`) gets its reveal call; this one
is simply missing. The server computed and flushed the right HTML and then never flushed the
instruction to show it — a truncated/dropped segment in the streaming response, not an application
logic bug. `apps/storefront/src/app/products/page.tsx` and `catalogue-toolbar.tsx` were both
re-read looking for anything that could cause this from the application side and found nothing —
no manual Suspense usage, no unusual async patterns; the boundary is created implicitly by the
route's own `loading.tsx`, same as every other route-level boundary in this app that works fine
(cart/checkout have no `loading.tsx` and are unaffected, which was already known; the new
information is that a production build is affected identically to dev).

**Suspect environment factor, not yet isolated further**: this project's installed toolchain is
Next.js **15.5.22** on React **19.2.8** on Node **v24.15.0** — an unusually new combination
(Node 24 is a very recent major). A streaming-response truncation of exactly this shape (content
flushed, terminal reveal script dropped, zero client or server error) is consistent with a
Node-HTTP/Next-streaming-internals interaction bug rather than anything in this app's own code,
but that is a hypothesis, not a confirmed diagnosis — it was not isolated further (e.g. by pinning
an older Node LTS and rebuilding) because that is an environment/toolchain decision with a blast
radius beyond this one route, and belongs to whoever owns that decision, not to a QA retest.

**Suggested Fix** — two independent tracks, either sufficient on its own:
1. **Toolchain**: try Node 20 or 22 LTS (matching `package.json`'s stated `engines` range if one
   exists) against the same build, to test the version-skew hypothesis above directly.
2. **Application-level mitigation, regardless of the toolchain root cause**: stop relying on the
   route-level `loading.tsx` for this route's main content and render the catalogue's own inline
   skeleton with an explicit `<Suspense>` scoped tightly around just the grid inside
   `page.tsx`/a small wrapper component. A narrower, explicit boundary is easier to reason about
   than the implicit route-level one and may not trigger whatever produces the dropped segment —
   but this has not been tried or verified, it is a plausible mitigation, not a confirmed fix.

**Retest Status** — RETESTED against a production build: confirmed FAIL, same as dev. Root cause
narrowed to a specific missing stream segment (documented above) but not yet fixed — no code
change has been made, per this phase's discovery-only rule. Severity stands at P1 (raised
confidence it is real and would ship; not raised to P0 because checkout itself remains reachable
by a cart created another way, and the fix options above are known, just not yet executed).

---

## BUG-FE-004 — An invalid price on Product create fails silently: no error, no feedback, dead button

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-004 |
| **Severity** | P2 — a validation failure produces no feedback at all, so the merchant sees a button that does nothing. |
| **Module** | Console products (`apps/console/src/app/(app)/products/new/page.tsx`) |
| **Page** | `/products/new` |
| **Environment** | As above |
| **User** | `owner@northwind.test` |
| **Tenant** | `northwind` |
| **Precondition** | None. |

**Steps to Reproduce**

1. `/products/new`. Enter Name `QA-FE Probe Product`, SKU `QA-FE-SKU-001`.
2. Enter `abc` in "Price (₹)" (also reproduces with a negative value such as `-5`).
3. Click "Create product".

**Expected Result** — an inline error under the Price field, e.g. "Enter a valid price".

**Actual Result** — the request fires and is rejected, and **nothing appears on screen**. No inline error, no root alert, no toast. The form sits unchanged.

**Evidence**

```js
// after clicking "Create product" with price "abc"
{ alerts: [], url: "/products/new" }     // zero [role=alert] nodes anywhere in the form
```

```
POST http://localhost:4000/api/v1/console/products -> 422 Unprocessable Entity
```

The server response is precise and does name a field — just not one the form renders:

```json
422
{ "success": false,
  "error": { "code": "VALIDATION_FAILED",
             "message": "The request contains invalid values",
             "details": [ { "field": "priceMinor", "code": "invalid_format",
                            "message": "Must be a non-negative integer string" } ] } }
```

Contrast — a 409 with an *empty* `details` array does surface, via the root-alert branch:

```
duplicate SKU -> POST /console/products -> 409 -> alert: "SKU 'QA-FE-SKU-001' is already in use"   (visible)
```

**Console Error** — none. **Network Error** — `POST /console/products` → `422`.

**API** — `POST /api/v1/console/products`

**Root Cause**

The form collects `price` (rupees) but sends `priceMinor`, and it omits `priceMinor` from its own
schema (`products/new/page.tsx:35-43`), so there is no `Field` bound to it and therefore no error
slot. `rupeesToMinorString('abc')` (`apps/console/src/lib/money.ts:12-19`) does no validation —
it string-concatenates to `"abc00"` — so the bad value reaches the server. The error handler then
does:

```ts
for (const [field, message] of Object.entries(error.fieldErrors)) {
  form.setError(field as keyof FormValues, { message });     // field = "priceMinor" -> nothing renders it
}
if (Object.keys(error.fieldErrors).length === 0) {
  form.setError('root', { message: error.message });         // skipped: fieldErrors is non-empty
}
```

Because `fieldErrors` is non-empty, the root-alert fallback is skipped, and because `priceMinor`
has no rendered `Field`, the message is discarded. `-5` takes the identical path (`"-500"` fails
the `/^\d+$/` regex).

**Suggested Fix**

Validate the price client-side in the form schema —
`z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid price')` — so `abc` and `-5` never
reach the server. Additionally, make the error mapper resilient: remap known wire fields to their
form fields (`priceMinor` → `price`, `comparePriceMinor` → `comparePrice`), and fall through to
the root alert whenever a returned field has no rendered control, so no server message is ever
silently dropped.

**Retest Status** — **FIXED — retested live in the browser.** Added a `price`/`comparePrice`
regex to the form schema (`apps/console/src/app/(app)/products/new/page.tsx`) and made the error
mapper remap `priceMinor`→`price`/`comparePriceMinor`→`comparePrice` with a root-alert fallback for
any still-unmapped field. Repro steps re-run at `/products/new`: entering `abc` in Price and
submitting now shows inline `price-error: "Enter a valid price"` instead of nothing. Filled in a
valid price (`199.99`) and SKU afterwards and the product created successfully
(`POST /console/products → 201`, redirected to `/products/{id}`), confirming no regression.

---

## BUG-FE-005 — A phone-only customer cannot be created, though the form explicitly offers it

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-005 |
| **Severity** | P2 — a documented, UI-advertised capability is unreachable, and the error blames a field the merchant deliberately left blank. |
| **Module** | Console customers (`apps/console/src/app/(app)/customers/new/page.tsx`) |
| **Page** | `/customers/new` |
| **Environment** | As above |
| **User** | `owner@northwind.test` |
| **Tenant** | `northwind` |
| **Precondition** | None. |

**Steps to Reproduce**

1. `/customers/new`.
2. First name `QA`, Last name `PhoneOnly`, Phone `+919876500022`. **Leave Email blank.**
3. Click "Create customer".

**Expected Result** — the customer is created. The Email field's own hint reads
**"Email or phone is required"** and the Phone field's reads **"Optional if email is given"**;
the API schema has both optional with an either-or refine.

**Actual Result** — submission is blocked by an error on **Email**:
`String must contain at least 3 character(s)`. No request is sent. A phone-only customer cannot be created through this form at all.

**Evidence**

```js
// firstName=QA, lastName=PhoneOnly, phone=+919876500022, email=""
{ alerts: ["String must contain at least 3 character(s)"], path: "/customers/new" }
```

The same message appears on a completely empty submit, i.e. Email behaves as mandatory:

```js
{ emptySubmit: { alerts: ["String must contain at least 3 character(s)"], path: "/customers/new" } }
```

Adding an email makes it succeed immediately, confirming Email is the blocker:

```
email=qa-fe-customer@qa.test + phone=+919876500033 -> POST /console/customers -> 201
```

**Console Error** — none. **Network Error** — none; no request is issued.

**API** — `POST /api/v1/console/customers` (never reached).

**Root Cause**

Two compounding issues in `customers/new/page.tsx`:

1. `email` is `emailSchema.optional()`, and `emailSchema` is
   `z.string().trim().toLowerCase().min(3).max(255).email(...)`. An untouched input yields `''`,
   not `undefined`, so `.optional()` does not apply and `.min(3)` fails. The submit handler *does*
   convert `'' → undefined`, but that runs **after** `zodResolver` has already rejected the form.
2. The wire schema's cross-field rule —
   `.refine(v => v.email ?? v.phone, { message: 'Either email or phone is required', path: ['email'] })` —
   lives on the outer `ZodEffects`, and the form builds its resolver from
   `createCustomerRequestSchema.innerType()`, which **strips the refine**. So the browser enforces
   neither the correct rule nor a coherent message.

**Suggested Fix**

Give `email` the same treatment the file already applies to `password` (whose comment explains
this exact hazard): accept an empty string and validate only when non-empty —
`z.string().trim().optional().refine(v => !v || z.string().email().safeParse(v).success, { message: 'Must be a valid email address' })`.
Then re-add the either-or rule to the *form* schema with a real message, e.g.
`.refine(v => Boolean(v.email?.trim() || v.phone?.trim()), { message: 'Enter an email address or a phone number', path: ['email'] })`.

**Retest Status** — **FIXED — retested live in the browser.** `email` on the form schema now
accepts `''` and validates format only when non-empty, and the either-or refine was re-added to
the form's own schema. Repro re-run at `/customers/new`: First name `QA`, Last name `PhoneOnly`,
Phone `+919876500099`, Email left blank, submit → `POST /console/customers → 201 Created`
(previously blocked with "String must contain at least 3 character(s)"). Confirmed via
`GET /console/customers/{id}`: `{ email: null, phone: '+919876500099', displayName: 'QA
PhoneOnly' }`.

---

## BUG-FE-006 — An invalid phone number on Customer create shows no error and sends no request

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-006 |
| **Severity** | P2 — the primary action button becomes a silent no-op with no way for the merchant to discover why. |
| **Module** | Console customers (`apps/console/src/app/(app)/customers/new/page.tsx`) |
| **Page** | `/customers/new` |
| **Environment** | As above |
| **User** | `owner@northwind.test` |
| **Tenant** | `northwind` |
| **Precondition** | None. |

**Steps to Reproduce**

1. `/customers/new`.
2. Email `qa-fe-cust@qa.test` (valid), Phone `12345` (not E.164).
3. Click "Create customer". Click it again.

**Expected Result** — an inline error under Phone, matching the message the address dialog already
uses: "Must be E.164 format, e.g. +919876543210".

**Actual Result** — absolutely nothing happens. No error anywhere on the page, no network request, no navigation. The button appears broken.

**Evidence**

```js
// email valid, phone "12345"
{ alerts: [],                 // no [role=alert] anywhere on the page
  phoneErrorEl: false,        // document.getElementById('phone-error') does not exist
  emailErrorEl: false,
  phoneHint: "Optional if email is given",
  path: "/customers/new" }
```

No request was issued — the last `console/customers` traffic predates the click:

```
GET  /api/v1/console/customers?page=1&limit=1   -> 200 OK    (earlier)
GET  /api/v1/console/customers?page=1&limit=20  -> 200 OK    (earlier)
   ... no POST /console/customers at all
```

The identical rule, on the same tenant, in the customer **address** dialog does render properly —
so the message exists in the codebase and only this form fails to show it:

```
address dialog, phone "12345" -> "Must be E.164 format, e.g. +919876543210"   (visible)
```

**Console Error** — none. **Network Error** — none; nothing is sent.

**API** — `POST /api/v1/console/customers` (never reached).

**Root Cause**

`phone` is `phoneSchema.optional()` (regex `/^\+[1-9]\d{7,14}$/`), so `12345` correctly fails
validation and `zodResolver` blocks the submit. But the Phone `Field` is rendered **without an
`error` prop**:

```tsx
<Field label="Phone" htmlFor="phone" hint="Optional if email is given">
  <Input id="phone" type="tel" placeholder="+91XXXXXXXXXX" {...form.register('phone')} />
</Field>
```

`Field` only renders `<p id="{htmlFor}-error" role="alert">` when it receives `error`
(`primitives.tsx:156-194`), so the validation error is held in form state and never displayed.
This is the same class of defect the file's own comments describe having been found before on
`brandId` in the product form ("the button did nothing … the failure was invisible").

**Suggested Fix**

Pass the error through: `error={form.formState.errors.phone?.message}` (and audit the remaining
`Field`s with no `error` prop — `firstName`, `lastName` and `acceptsMarketing` here, plus
`comparePrice`, `status`, `visibility`, `brandId`, `categoryId`, `shortDescription` and
`description` on the product forms). A cheap structural guard: have `Field` read the error from
form context, or add a lint/test that fails when a registered input's `Field` has no `error` prop.

**Retest Status** — **FIXED — retested live in the browser.** `error` wired up on Phone (and
firstName/lastName/acceptsMarketing on `customers/new`; comparePrice/status/visibility/brandId/
categoryId/shortDescription/description on both `products/new` and `products/[id]`). Repro re-run:
Email `qa-fe-cust-retest@qa.test`, Phone `12345`, submit → inline
`phone-error: "Must be E.164 format, e.g. +919876543210"` now renders (previously nothing, no
request). While wiring the audit, discovered and fixed a related latent bug it exposed:
`firstName`/`lastName` inherited `shortTextSchema(100).optional()` from the wire schema, so an
untouched (empty) "Optional" field failed `.min(1)` and blocked every submission once its error
became visible — relaxed both to accept `''` on the form schema, matching the treatment already
used for `password`/`email` on this file. Confirmed a full valid submission afterward succeeds
(`POST /console/customers → 201`).

---

## BUG-FE-007 — Console list pages render API errors as "no data": a 403 is indistinguishable from an empty result

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-007 |
| **Severity** | P2 — the UI states something false ("no coupons") when the truth is "you are not allowed to see these" or "the request failed". It also masks real failures during development and support. |
| **Module** | Console — every list page (`coupons`, `products`, `orders`, `customers`, `inventory`, and all eight dashboard queries) |
| **Page** | `/coupons` (reproduced), and by the same code pattern `/products`, `/orders`, `/customers`, `/inventory`, `/` |
| **Environment** | As above |
| **User** | `ops@northwind.test` (ORDER_MANAGER, 22 permissions — lacks `coupon:read`) |
| **Tenant** | `northwind` |
| **Precondition** | 16 coupons exist in northwind. Sign in as a role without `coupon:read`. |

**Steps to Reproduce**

1. Sign in as `ops@northwind.test` / `DemoPassword123!`.
2. Navigate to `/coupons`.
3. Compare what the page says with the network response.

**Expected Result** — an error state distinct from emptiness, e.g. "You do not have permission to view coupons." (or a generic "Could not load coupons. Try again.", as the Sessions page already does for its own query).

**Actual Result** — the page renders the empty state, **"No coupons match these filters."**, while the API returned `403`. Sixteen coupons exist.

**Evidence**

```js
// /coupons as ops@northwind.test
{ main: "Coupons Discount codes for the storefront. All statuses Active Archived
          Code Discount Usage Status Ends No coupons match these filters.",
  buttons: [],
  tbody: "No coupons match these filters." }
```

```
GET http://localhost:4000/api/v1/console/coupons?page=1&limit=20 -> 403 Forbidden
```

Confirmed at the API, with the true row count and the permission denial:

```
403  /console/coupons?page=1&limit=1  -> PERMISSION_DENIED
     (as owner@northwind.test the same endpoint returns total=16)
```

**Console Error** — `Failed to load resource: the server responded with a status of 403 (Forbidden)`.
**Network Error** — `GET /api/v1/console/coupons?page=1&limit=20` → `403 PERMISSION_DENIED`.

**API** — `GET /api/v1/console/coupons` (and the equivalent list endpoint on every other list page).

**Root Cause**

The table body branches on exactly two states and never reads `isError`:

```tsx
{couponsQuery.isLoading
  ? <TableEmptyRow colSpan={...}>Loading…</TableEmptyRow>
  : coupons.length === 0
    ? <TableEmptyRow colSpan={...}>No coupons match these filters.</TableEmptyRow>
    : rows}
```

On error, TanStack Query leaves `data` undefined, `coupons` defaults to `[]`, and the code takes
the "empty" branch. `apps/console/src/app/(app)/products/page.tsx`, `orders/page.tsx`,
`customers/page.tsx`, `inventory/page.tsx` and all eight queries on `(app)/page.tsx` share the
pattern. `ApiError` already exposes `isForbidden` / `isValidation` helpers
(`api-client.ts`), so the information needed is available and simply unused.

**Suggested Fix**

Add a third branch to each list page, e.g.

```tsx
{query.isError && <Alert variant="error">
  {isForbidden(query.error)
    ? 'You do not have permission to view this.'
    : 'Could not load this list. Try refreshing the page.'}
</Alert>}
```

The Sessions page (`sessions/page.tsx:40-42`) already does exactly this for its own query and is a
good in-repo template. Worth doing as one sweep across the six pages.

**Retest Status** — **FIXED — retested live in the browser** for the sharpest case (coupons).
Added `isForbidden`/`isValidation` helpers to `api-client.ts` and an `isError` branch to
`coupons/page.tsx`, `products/page.tsx`, `orders/page.tsx`, `customers/page.tsx`,
`inventory/page.tsx`, and the 7 permission-gated queries plus the store query on `(app)/page.tsx`.
Repro re-run exactly as written: signed in as `ops@northwind.test`, navigated to `/coupons` →
now renders **"You do not have permission to view coupons."** instead of "No coupons match these
filters." (API still returns `403` underneath, confirmed unchanged). `products`/`orders`/
`customers` list pages could not be exercised through the same live 403 path with the available
test accounts — every non-owner/admin seeded role lacks `store:read`, and those three pages have
their own pre-existing (out-of-scope) gate that returns before the table when `!store`, so their
`isError` branch never gets a chance to render for any account other than owner/admin, who never
403 on `coupon`/`product`/`order`/`customer` reads. The code is identical to the coupons pattern
just verified live, and `npx tsc --noEmit` is clean on `apps/console`.

---

## BUG-FE-008 — Dashboard and Inventory tell a role without `store:read` that no store exists

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-008 |
| **Severity** | P2 — the whole dashboard is replaced by a factually incorrect explanation that misdirects the user (and support) toward provisioning, when the real cause is a missing permission. `ORDER_MANAGER` is a shipped seeded role. |
| **Module** | Console dashboard + inventory (`(app)/page.tsx`, `(app)/inventory/page.tsx`, via `useCurrentStore`) |
| **Page** | `/` and `/inventory` |
| **Environment** | As above |
| **User** | `ops@northwind.test` (ORDER_MANAGER — lacks `store:read`) |
| **Tenant** | `northwind`, which **does** have an active store, `Northwind Main Store` (`01M1W1MAYS3746WD70SB4ZZPGA`) |
| **Precondition** | Sign in as a role without `store:read`. |

**Steps to Reproduce**

1. Sign in as `ops@northwind.test`.
2. Go to `/`.
3. Go to `/inventory`.

**Expected Result** — either the real dashboard (the role *does* hold `report:read`, and
`GET /console/inventory/low-stock` returns `200` for it), or an honest permission message. Not a
claim that the tenant has no store.

**Actual Result**

`/` renders:

> **No store on this account yet** — A store is created when your tenant is provisioned. If that has not happened, the system status page will show whether the API is healthy. · *Check system status*

`/inventory` renders: **"No store found for this account yet."**

Both statements are false.

**Evidence**

```js
// / as ops@northwind.test
{ dashboard: "Dashboard No store on this account yet A store is created when your tenant is
              provisioned. If that has not happened, the system status page will show whether
              the API is healthy. Check system status" }
// /inventory as ops@northwind.test
{ inventory: "Inventory Stock levels, reorder alerts, and adjustments. No store found for this
              account yet." }
```

The store exists; only the *lookup* is forbidden, and other data the page needs is permitted:

```
403  /console/stores                      -> PERMISSION_DENIED
200  /console/inventory/low-stock          -> ok
200  /console/reports/sales-summary?...    -> ok
200  /console/products?page=1&limit=1      -> ok
     (as owner@northwind.test, /console/stores returns Northwind Main Store)
```

**Console Error** — `Failed to load resource: … 403 (Forbidden)`.
**Network Error** — `GET /api/v1/console/stores` → `403 PERMISSION_DENIED`.

**API** — `GET /api/v1/console/stores`

**Root Cause**

`useCurrentStore()` returns `store = data?.[0]`, which is `undefined` on a `403` exactly as it is
when the tenant genuinely has no store. Both pages then take the no-store branch
(`(app)/page.tsx:123`, `inventory/page.tsx:36`) and render copy written for the provisioning case.
This is BUG-FE-007's root cause with a more actively misleading message, and it additionally
blocks `/inventory` from showing low-stock rows it is allowed to read.

**Suggested Fix**

Distinguish the two cases: if `storesQuery.isError && isForbidden(error)`, render a permission
message instead of the provisioning empty state. Separately, `/inventory` should not gate its
low-stock table on the store query at all — it does not use `store` for that request. Longer
term, either grant `store:read` to every role that has a console page needing store context, or
expose the caller's own store through an endpoint that does not require `store:read`.

**Retest Status** — **FIXED — retested live in the browser**, both repro steps exactly as written.
Signed in as `ops@northwind.test`:
- `/` now renders **"You do not have permission to view this store" / "Your role does not include
  store access. Ask an administrator to grant it."** (previously the false "No store on this
  account yet" provisioning message).
- `/inventory` now renders **"You do not have permission to look up this store, so search by
  store is unavailable."** under "Find a product", *and* the Low stock table below it renders
  correctly — `Test Widget · Main Warehouse · 11 available of 20` — no longer blocked by the store
  query it never needed. Both are real behavior changes confirmed via screenshots and DOM reads,
  not just code review.

---

## BUG-FE-009 — `/products/new` is not permission-gated, and its Create button is a silent no-op for a role that cannot read stores

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-009 |
| **Severity** | P2 — a user is allowed to fill in a whole form and then gets no response and no explanation. No security impact (the API would reject the write). |
| **Module** | Console products (`apps/console/src/app/(app)/products/new/page.tsx`) |
| **Page** | `/products/new` |
| **Environment** | As above |
| **User** | `ops@northwind.test` (ORDER_MANAGER — no `product:create`, no `store:read`) |
| **Tenant** | `northwind` |
| **Precondition** | Sign in as a role without `product:create`. |

**Steps to Reproduce**

1. Sign in as `ops@northwind.test`. Confirm `/products` correctly hides "New product".
2. Navigate directly to `http://localhost:3000/products/new`.
3. Fill Name `QA-FE RBAC Should Fail`, SKU `QA-FE-RBAC-FAIL`, Price `5`.
4. Click "Create product".

**Expected Result** — either the route refuses to render (a permission gate, consistent with the
list page hiding the entry point), or the click produces a clear "You do not have permission to
create products" message.

**Actual Result** — the full form renders, and clicking "Create product" does nothing: no request, no error, no navigation.

**Evidence**

```js
// /products/new as ops@northwind.test, after filling valid values and clicking Create
{ formRendered: true, alerts: [], path: "/products/new" }
```

No `POST` was issued — the newest `console/products` traffic is all reads:

```
GET /api/v1/console/products/01M1ZFER21MNBFCDPCA4RT4X14                  -> 200 OK
GET /api/v1/console/products?page=1&limit=20&storeId=01M1W1MAYS...       -> 200 OK
   ... no POST /console/products
```

The cause is the missing store, not the missing `product:create`:

```
403  /console/stores -> PERMISSION_DENIED   (as ops@northwind.test)
```

For contrast, the list page's gating is correct for the same user:

```js
{ newProduct: false, editButtons: 0, deleteButtons: 0, publishButtons: 0, rowCount: 20 }
```

**Console Error** — none at click time. **Network Error** — `GET /console/stores` → `403` on load.

**API** — `POST /api/v1/console/products` (never reached).

**Root Cause**

Two gaps combine:

1. The page has **no** `usePermission('product:create')` check — the route renders for anybody
   who is authenticated. Only the *links* to it (dashboard and products list) are gated.
2. `onSubmit` opens with `if (!store) return;` (`products/new/page.tsx:83`). Because
   `GET /console/stores` 403s for this role, `store` is `undefined` forever and every submit
   returns early — no request, no state change, no message. The same early return would fire for
   any user whose store query is merely still in flight.

**Suggested Fix**

Gate the route: if `!usePermission('product:create')`, render a "You do not have permission to add
products" card instead of the form. And replace the bare early return with real feedback —
distinguish "still loading" (disable the submit and show a pending state) from "no store
available" (`form.setError('root', …)` with an explanatory message). Apply the same to
`/customers/new` and `/coupons/new`, which are ungated in the same way.

**Retest Status** — **FIXED — retested live in the browser** on all three routes named in the
suggested fix. Signed in as `ops@northwind.test` (lacks `product:create`/`customer:create`/
`coupon:create`) and navigated directly to each:
- `/products/new` → **"You do not have permission to add products. Ask an administrator to grant
  product:create."** — the form never renders.
- `/customers/new` → **"You do not have permission to add customers. Ask an administrator to grant
  customer:create."**
- `/coupons/new` → **"You do not have permission to add coupons. Ask an administrator to grant
  coupon:create."**

All three previously rendered the full form with a silently-failing submit. Also replaced the bare
`if (!store) return` in `products/new`'s submit handler with a `form.setError('root', …)` message
distinguishing "still loading" from "no store available"/"forbidden".

---

## BUG-FE-010 — A percentage coupon accepts a discount above 100%

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-010 |
| **Severity** | P2 — a validation gap on a money field. Downgraded from P1 because the discount engine clamps at the subtotal, so **no negative total or negative-value order is possible** (verified). The real risk is a typo (`150` for `15`) silently becoming a 100%-off coupon. |
| **Module** | Console coupons + coupon contract (`apps/console/src/app/(app)/coupons/new/page.tsx`, `packages/contracts/src/coupon/coupon.contracts.ts`) |
| **Page** | `/coupons/new` (and `/coupons/[id]`) |
| **Environment** | As above |
| **User** | `owner@northwind.test` |
| **Tenant** | `northwind` |
| **Precondition** | None. |

**Steps to Reproduce**

1. `/coupons/new`. Code `QA-FE-OVER100`, Discount type **Percentage off**, Percentage `150`.
2. Click "Create coupon".
3. Add any product to a storefront cart and apply `QA-FE-OVER100`.
4. Place the order.

**Expected Result** — step 2 rejected with an inline error such as "Percentage must be between 0 and 100".

**Actual Result** — the coupon is created and becomes `ACTIVE` at 150%.

**Evidence**

Creation succeeds and redirects to the new coupon:

```js
{ over100: { alerts: [], path: "/coupons/01M1ZGB0R3N4GB7S1DWPBPJHRF" } }
```

The edit page and the list both show the stored value:

```js
{ h1: "QA-FE-OVER100", discountType: "PERCENTAGE", discountValue: "150.0000", status: "ACTIVE" }
```

Applied to a real cart, the discount **is** clamped to the subtotal — this is the reassuring half:

```
product Test Widget  subtotal 19999
apply 150% coupon -> 201   subtotal 19999  discount 19999  TOTAL 0 (₹0.00)
pricing           -> 201   sub=19999 disc=19999 ship=5000  TOTAL=5000 (₹50.00)
place order       -> 201   ORD-000022  TOTAL=8000 (₹80.00)     // ₹50 shipping + ₹30 COD
```

So the outcome is a 100%-off item, never a negative charge. Negative *input* is separately safe:
the wire regex is `/^\d+(\.\d+)?$/`, which rejects `-10`.

**Console Error** — none. **Network Error** — none; `POST /console/coupons` → `201`.

**API** — `POST /api/v1/console/coupons`, `PUT /api/v1/console/coupons/:id`

**Root Cause**

Neither layer bounds a percentage. The form schema (`coupons/new/page.tsx:24-61`) types
`discountValue` as `z.string().trim().optional()` with only a "required unless FREE_SHIPPING"
refine. The wire schema (`coupon.contracts.ts:10-44`) types it as
`z.string().regex(/^\d+(\.\d+)?$/)` — format only. Because the same field carries both a
percentage and a minor-unit amount depending on `discountType`, no single numeric bound was
applied to either.

**Suggested Fix**

Add a `discountType`-aware refine in both schemas: when `discountType === 'PERCENTAGE'`, require
`0 < Number(discountValue) <= 100` with the message "Percentage must be between 0 and 100"; when
`FIXED_AMOUNT`, require a non-negative integer minor amount. Server-side enforcement matters more
than client-side, since coupons can also be created through the API.

**Retest Status** — **FIXED — retested at both the API and the UI.**
```
POST /console/coupons {code:"QA-RETEST-OVER100", discountType:"PERCENTAGE", discountValue:"150"}
  -> 422 { field: "discountValue", message: "Percentage must be between 0 and 100" }
POST /console/coupons {code:"QA-RETEST-15PCT", discountType:"PERCENTAGE", discountValue:"15"}
  -> 201 (valid values still work)
POST /console/coupons {code:"QA-RETEST-FIXEDBAD", discountType:"FIXED_AMOUNT", discountValue:"19.99"}
  -> 422 { field: "discountValue", message: "Must be a non-negative integer amount in minor units" }
```
Live in the browser at `/coupons/new`: code `QA-RETEST-OVER100-UI`, Percentage `150` → inline
`discountValue-error: "Percentage must be between 0 and 100"`, no request sent. Same refine added
to `/coupons/[id]`'s form schema. `updateCouponRequestSchema` (built from
`createCouponRequestSchema.innerType()`) was re-checked after this change — the new bound was
added as a single `superRefine` rather than chained `.refine()`s specifically so it stays one
`ZodEffects` layer and `.innerType()` still unwraps to the plain object everywhere it's called.

---

## BUG-FE-011 — Checkout shows a total that excludes the ₹30 COD fee the order actually charges

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-011 |
| **Severity** | P2 — the shopper is shown one figure and charged another. Held at P2 rather than P1/P0 because the fee is fixed, small, legitimate, and disclosed **in prose on the same screen** immediately above the total; nothing is miscalculated and no payment is captured. It is nevertheless a real "displayed price ≠ charged price" and a reasonable person could argue P1. |
| **Module** | Storefront checkout + checkout pricing contract (`apps/storefront/src/components/checkout-view.tsx`, `packages/contracts` `checkoutPricingRequestSchema`, `apps/api/src/modules/checkout/checkout.service.ts`) |
| **Page** | `/checkout` → `/checkout/confirmation` |
| **Environment** | Storefront `http://northwind.ems.localhost:3001`, 2026-09-08 |
| **User** | Anonymous shopper (guest checkout) |
| **Tenant** | `northwind` |
| **Precondition** | A cart with at least one item. COD is the only payment method available. |
| **Prior ID** | This is **KF-08**, previously open and untested; now confirmed live through the UI. |

**Steps to Reproduce**

1. Add `Test Widget` (₹199.99) to the cart.
2. Go to `/checkout` and complete the delivery address (name, address, city, postal code, country).
3. Wait for the live pricing to settle and read the **Total** in "Your order".
4. Click "Place order" and read the **Total** on the confirmation page.

**Expected Result** — the same figure on both screens, with the COD fee itemised as a line in the
summary once COD is the selected method.

**Actual Result** — checkout shows **₹249.99**; the confirmation and the stored order show
**₹279.99**. The ₹30.00 difference is the COD handling fee, which the pricing endpoint cannot quote.

**Evidence**

Through the UI, same session, same order:

```js
// /checkout, address complete, live pricing settled
{ totalShownAtCheckout: "₹249.99" }
   summary: "Subtotal ₹199.99  Shipping ₹50.00  Total ₹249.99
             Shipping and tax calculated for your address. A cash-on-delivery fee is added on top."

// immediately after "Place order"
{ main: "Order confirmed … Order number ORD-000023  Total ₹279.99  Payment Due on delivery" }
```

Independently, at the API, with a larger cart:

```
PRICING PREVIEW -> 201  subtotal 6449700  discount 0  shipping 5000  tax 0  total 6454700   codFee (field absent)
   CHECK total = sub - disc + ship + tax: 6454700  == actual 6454700     (preview maths is correct)

PLACE ORDER     -> 201  ORD-000020  total 6457700
   PREVIEW total: 6454700   ORDER total: 6457700   DIFF: 3000  (= ₹30.00 COD fee)
```

The console's order detail *does* itemise it, so only the pre-purchase quote is missing it:

```
ORD-000020: Subtotal ₹64,497.00 · Shipping ₹50.00 · Tax ₹0.00 · COD fee ₹30.00 · Total ₹64,577.00
```

**Console Error** — none. **Network Error** — none; both calls return `201`.

**API**

```
POST /api/v1/storefront/checkout/pricing   (no paymentGateway field -> cannot include the fee)
POST /api/v1/storefront/checkout/orders    (adds codFee when paymentGateway === 'cod')
```

**Root Cause**

`checkoutPricingRequestSchema` is `{ cartId, shippingAddress?, shippingMethod? }` — it has **no
`paymentGateway` field**, so the quote endpoint cannot know COD is intended.
`CheckoutService.priceOrder()` therefore computes
`total = subtotal - discount + shipping + tax` and never applies the fee, while
`CheckoutService.placeOrder()` computes
`total = subtotal - discount + shipping + codFee + tax` with
`codFee = isCod ? Money.fromMinor(COD_FEE_MINOR) : zero` and `COD_FEE_MINOR = '3000'`
(`checkout.service.ts:42`). The UI compensates with prose
(`checkout-view.tsx:308-311, 344-348`) precisely because the panel has no figure to show.

**Suggested Fix**

Add `paymentGateway` to `checkoutPricingRequestSchema`, have `priceOrder()` apply the same
`codFee` term as `placeOrder()`, and return `codFee` in `CheckoutPricingResponse`. Then render a
"Cash-on-delivery fee" row in `OrderSummary` (it already conditionally renders Discount and Tax,
so the pattern exists) and drop the prose workaround. That makes one code path the single source
of the total and removes the possibility of the two diverging again.

**Retest Status** — **FIXED — retested end-to-end, API and UI, with the exact repro shape.**

API, same cart, with vs. without `paymentGateway`:
```
POST /checkout/pricing (no paymentGateway)     -> subtotal 77777 shipping 5000 total 82777 (no codFee)
POST /checkout/pricing {paymentGateway:"cod"}  -> subtotal 77777 shipping 5000 codFee 3000 total 85777
POST /checkout/orders  {paymentGateway:"cod"}  -> ORD-000024 total 85777   <- matches the COD-quoted preview exactly
```

Live in the storefront at `/checkout`: filled in a delivery address, the "Your order" panel now
shows a **"Cash-on-delivery fee ₹30.00"** line and a **Total of ₹2,879.00**; clicking "Place order"
landed on the confirmation page reading **"Total ₹2,879.00"** — the same figure, not the previous
₹30 short. The prose workaround ("A cash-on-delivery fee is added on top") was removed from
`checkout-view.tsx` since the fee is now an itemised figure.

---

## BUG-FE-012 — The category picker shows the internal materialised path instead of the category name

| Field | Value |
|---|---|
| **Bug ID** | BUG-FE-012 |
| **Severity** | P2 — the control is unusable for its purpose: the merchant cannot tell which category they are selecting, and with several categories every option would look alike. It also exposes internal ids in the UI. |
| **Module** | Console products (`apps/console/src/app/(app)/products/new/page.tsx`, `products/[id]/page.tsx`) |
| **Page** | `/products/new` and `/products/[id]` |
| **Environment** | As above |
| **User** | `owner@northwind.test` |
| **Tenant** | `northwind`, which has one category named **"Widgets"** |
| **Precondition** | At least one category exists. |

**Steps to Reproduce**

1. `/products/new`.
2. Open the "Category" dropdown.

**Expected Result** — an option labelled **"Widgets"**.

**Actual Result** — the option is labelled **`/1/`**.

**Evidence**

```
Category select options (live DOM):
  <option value="">None</option>
  <option value="01M1W26739QW4DY8AMZQAGYW9B">/1/</option>
```

The API returns a perfectly good name; the UI just prefers the wrong field:

```
GET /api/v1/console/categories -> 200
[ { "id": "01M1W26739QW4DY8AMZQAGYW9B", "parentId": null,
    "name": "Widgets", "slug": "widgets", "path": "/1/", "depth": 0,
    "productCount": 1, "isActive": true, ... } ]
```

`/1/` is a materialised path of **internal numeric ids** — it is not a human-readable breadcrumb.
Reproduced identically on the edit page:

```js
// /products/01M1ZFER21MNBFCDPCA4RT4X14
{ categoryLabel: ["None", "/1/"] }
```

**Console Error** — none. **Network Error** — none.

**API** — `GET /api/v1/console/categories?limit=100`

**Root Cause**

`products/new/page.tsx:188` (and the same line in `products/[id]/page.tsx`):

```tsx
{categories?.map((c) => (
  <option key={c.id} value={c.id}>
    {c.path || c.name}
  </option>
))}
```

`path` is preferred over `name`, and because `path` is always populated the name is never shown.
The intent was presumably to display a nesting breadcrumb, but `path` holds internal ids, not names.

**Suggested Fix**

Use `{c.name}`. If a nesting hint is wanted, build it from names — indent by `c.depth`
(e.g. `'  '.repeat(c.depth) + c.name`), or resolve ancestor names from
`GET /console/categories/tree`, which already returns the hierarchy with `children`.

**Retest Status** — **FIXED — retested live in the browser** on both pages named in the report.
`/products/new`: `Array.from(document.querySelectorAll('#categoryId option')).map(o=>o.textContent)`
→ `["None", "Widgets"]` (was `["None", "/1/"]`). Created a test product, opened its edit page
(`/products/[id]`) and confirmed the same select there also shows `"Widgets"`, not `/1/`.

---

## BUG-FE-013 (P3) — Raw Zod default messages are shown to users

**Module/Page:** Login, Forgot password, Product create/edit, Coupon create, Customer create, Customer address dialog, Checkout (max-length only).
**User/Tenant:** any / any. **Environment:** as above.

**Steps** — submit each form with the field empty or over-long.

**Expected** — a human message naming the field and the requirement.
**Actual** — the untranslated Zod default. Observed verbatim:

```
Login, empty email            -> "String must contain at least 3 character(s)"
Forgot password, empty email  -> "String must contain at least 3 character(s)"
Customer create, empty email  -> "String must contain at least 3 character(s)"
Coupon create, empty code     -> "String must contain at least 3 character(s)"
Product create, empty name    -> "String must contain at least 1 character(s)"
Product create, 600-char name -> "String must contain at most 500 character(s)"
Address dialog, empty submit  -> "String must contain at least 1 character(s)"  x4 (one per required field)
Checkout, 250-char full name  -> "String must contain at most 200 character(s)"
```

The same forms prove the fix is cheap and already partly done — `"Password is required"`,
`"Price is required"`, `"Discount value is required"`, `"Must be a valid email address"`,
`"Whole number only"`, `"Must not be zero"`, `"Choose two different warehouses"`,
`"Who should we deliver to?"`, `"Enter the city"` are all custom and good. The storefront
checkout schema is the model to copy.

**Root Cause** — `.min()` / `.max()` called without a message argument in
`packages/contracts` primitives (`emailSchema`, `shortTextSchema`, product `name`, coupon `code`)
and in the address form schema.
**Suggested Fix** — add message arguments to every `.min()`/`.max()` in the shared primitives,
which fixes all call sites at once.
**Retest Status** — **FIXED — retested live in the browser** against every case listed in
"Observed verbatim":
```
Login, empty email            -> "Must be at least 3 characters"                (was the raw Zod default)
Coupon create, empty code     -> "Must be at least 3 characters"
Product create, empty name    -> "Name is required"
Product create, 600-char name -> "Must be at most 500 characters"
Address dialog, empty submit  -> "This field is required"  x4
Checkout, 250-char full name  -> "Must be at most 200 characters"
```
Added messages to `emailSchema`, `shortTextSchema`, product `name` and coupon `code` in
`packages/contracts/src/common/primitives.ts` (`emailSchema`/`shortTextSchema`),
`product.contracts.ts` and `coupon.contracts.ts` — these fixed the console address dialog for
free, since it already builds on `addressRequestSchema` → `shortTextSchema`. The checkout case
needed a second, separate fix: `apps/storefront/src/lib/checkout-schema.ts` has its **own**
inline schema (not built from `packages/contracts`), and its `.max(200)` on `recipientName` (and
several sibling fields) had no message either — found during retest, not in the original report,
and fixed the same way (added messages to every `.max()` in that file).

---

## BUG-FE-014 (P3) — Publishing one product puts every Publish button in the table into the loading state

**Module/Page:** `/products` (`apps/console/src/app/(app)/products/page.tsx:173`).
**User/Tenant:** `owner@northwind.test` / `northwind`. **Environment:** as above.

**Steps** — have several DRAFT products on one page; click "Publish" on one; immediately inspect all Publish buttons.

**Expected** — only the clicked row shows a spinner and is disabled.
**Actual** — all of them are disabled simultaneously. Measured live (page 2 had 9 DRAFT rows):

```js
{ beforeDisabledCount: 0, totalPublishButtons: 9,
  duringDisabled: [ {n:"QA-RBAC victim PLATFORM_SUPE", disabled:true},
                    {n:"QA-RBAC 1788804190428",        disabled:true},
                    {n:"QA-RBAC victim INVENTORY_MAN", disabled:true},
                    {n:"QA-RBAC victim MARKETING_MAN", disabled:true},
                    {n:"QA-RBAC victim CUSTOMER_SUPP", disabled:true},
                    {n:"QA-RBAC 1788804328550",        disabled:true},
                    {n:"QA-RBAC victim RESELLER",      disabled:true},
                    {n:"QA-RBAC 1788804395877",        disabled:true},
                    {n:"QA-FE Ünïcödé Wîdget 🧪🚀 日本",  disabled:true} ] }
```

The publish itself is correct (`POST …/publish → 200`, DRAFT → ACTIVE, `publishedAt` set).
**Root Cause** — `loading={publishProduct.isPending}` uses the mutation's global pending flag with no per-row key.
**Suggested Fix** — key it to the row, as `sessions/page.tsx:77` and the dashboard's Mark-read button already do:
`loading={publishProduct.isPending && publishProduct.variables === product.id}`.
**Retest Status** — **FIXED — retested live in the browser.** Applied exactly the suggested key.
Filtered `/products` to `status=DRAFT` (13 rows), clicked Publish on the first row, and read every
row's `disabled` state ~50ms later: `[true, false, false, false, false, false, false, false,
false, false, false, false, false]` — only the clicked row disables. After the mutation settled,
the list refetched and the published product (no longer DRAFT) dropped out of the filtered view,
confirming the correct row was published.

---

## BUG-FE-015 (P3) — Percentage discounts display with four trailing decimals

**Module/Page:** `/coupons` (list) and `/coupons/[id]` (edit).
**User/Tenant:** `owner@northwind.test` / `northwind`. **Environment:** as above.

**Expected** — `10% off`, and `10` in the edit input.
**Actual** — the raw `DECIMAL(_,4)` value:

```
list row:   "QA-FE-OVER100  QA-FE Coupon Ünïcödé 🎟️  12.5000% off  1  ACTIVE  No end date  Delete"
edit input: discountValue = "150.0000"
```

Affects every percentage coupon in northwind (`5.0000`, `10.0000`).
**Root Cause** — `describeDiscount()` interpolates `coupon.discountValue` verbatim for
`PERCENTAGE`, and the edit page's `form.reset` passes it through unchanged (only `FIXED_AMOUNT`
goes through `minorStringToRupees`).
**Suggested Fix** — normalise for display, e.g. `Number(discountValue)` (→ `12.5`, `10`), or trim
trailing zeros. Do it in one shared helper so the list, the edit input and any future report agree.
**Retest Status** — **FIXED — retested live in the browser.** Created a coupon with `discountValue
12.5` via `/coupons/new`. Edit page (`/coupons/[id]`) input now reads `discountValue = "12.5"`
(was `"150.0000"`-style raw decimal). List page (`/coupons`) row now reads `"12.5% off"` (was
`"12.5000% off"`). Both `describeDiscount()` and the edit page's `form.reset` now go through
`Number(discountValue)`.

---

## BUG-FE-016 (P3) — The order-detail Discount row renders as a positive amount with no minus sign

**Module/Page:** `/orders/[id]` totals block.
**User/Tenant:** `owner@northwind.test` / `northwind`. **Environment:** as above.

**Expected** — a visual indication that the amount is subtracted, matching the storefront.
**Actual** — on `ORD-000004`:

```
Subtotal ₹21,499.00 · Discount ₹2,149.90 · Shipping ₹50.00 · Tax ₹0.00 · COD fee ₹30.00 · Total ₹19,429.10
```

The arithmetic is exact (21,499.00 − 2,149.90 + 50.00 + 30.00 = 19,429.10) — only the presentation
is ambiguous, since a reader scanning the column sees five positive numbers that do not add to the total.
The storefront's own `OrderSummary` already prefixes `− `, so the two surfaces disagree.
**Root Cause** — `TotalRow` (`orders/[id]/page.tsx:270-277`) applies no sign treatment; the
storefront's `order-summary.tsx:44` does.
**Suggested Fix** — prefix the discount (and any refund) with `− ` in the console totals block, matching the storefront.
**Retest Status** — **FIXED — retested live in the browser**, same order (`ORD-000004`). Reading
the totals block now returns: `"Subtotal ₹21,499.00 Discount − ₹2,149.90 Shipping ₹50.00 Tax
₹0.00 COD fee ₹30.00 Total"` — the discount row is prefixed with `− `, matching the storefront.
Applied the same treatment to the Refunded row (also a subtracted amount) via a new `negative`
prop on `TotalRow`.

---

## BUG-FE-017 (P3) — The Sessions page cannot help a user spot a suspicious session: no "last used", no pagination, no confirmation

**Module/Page:** `/sessions`.
**User/Tenant:** `owner@northwind.test` / `northwind`. **Environment:** as above.

Three related weaknesses on a page whose stated purpose is *"Devices currently signed in to your
account. Revoke anything you don't recognise."*

1. **"Last used" is never populated.** Every row, including the active device, reads
   `last used not since sign-in` — so the one field that would identify a stale or foreign session
   carries no information:
   ```
   Unknown device  127.0.0.1 · last used not since sign-in   Revoke
   Chrome on Windows THIS DEVICE  127.0.0.1 · last used not since sign-in   Sign out here
   ```
2. **No pagination.** `GET /auth/sessions` returned **71** rows, all rendered at once, with no
   pagination and no "revoke all others" action.
3. **No confirmation on a destructive action.** "Revoke" acts immediately with no dialog — unlike
   every other destructive control in the console (product delete, coupon delete, order cancel,
   address delete all confirm). And because `revoke` has no `onError`, a failure would show nothing.

Revocation itself works correctly (`DELETE /auth/sessions/{id} → 200`, list refetched, 71 → 70,
and revoking a session in my own token family correctly ended my login).
**Root Cause** — `lastUsedAt` is evidently not written on token use; the page renders the whole array.
**Suggested Fix** — update `lastUsedAt` on refresh/use; paginate or cap the list with a "revoke all other devices" action; add a confirm dialog and an `onError` alert.
**Retest Status** — **FIXED — retested live, all three points, at the API and in the browser.**

1. **`lastUsedAt`.** Root cause was more specific than "never written": `used_at` *is* stamped on
   rotation, but the query read it off the family's *latest* row, which by construction always has
   `used_at IS NULL` (it stops being "latest" the instant it's rotated away). Changed
   `listActiveSessions()` to read `MAX(used_at)` across the whole active family instead
   (`refresh-token.service.ts`). Retested: logged in fresh, `GET /auth/sessions` showed several
   real historical timestamps where every row used to read `null`; then called
   `POST /auth/refresh` on the current session and re-fetched — the active session's `lastUsedAt`
   went from `null` to a live timestamp seconds old. Confirmed the same in the actual console UI:
   `/sessions` now reads "Chrome on Windows · THIS DEVICE · last used 1 second ago" instead of
   "not since sign-in".
2. **Pagination/cap.** Capped the rendered list at 20 with a "Showing the 20 most recent of N
   sessions" note, per the report's own "use judgment on scope" — a lighter touch than full
   pagination.
3. **Confirmation dialog.** Added a `Dialog` (title "Revoke this session?" / "Sign out this
   device?", Never mind / Revoke) plus an `onError` alert. Retested in the browser: clicking
   "Revoke" on a session now opens the confirm dialog (verified `role=dialog`,
   `aria-modal="true"` — see BUG-FE-021) instead of revoking immediately; "Never mind" closes it
   with no request sent.

---

## BUG-FE-018 (P3) — Fulfilment changes the order status without writing an ORDER timeline event

**Module/Page:** `/orders/[id]` Timeline card.
**User/Tenant:** `owner@northwind.test` / `northwind`, order `ORD-000020` (created by me). **Environment:** as above.

**Steps** — on a CONFIRMED order, click "Fulfil remaining items", then "Close order", then read the Timeline.

**Expected** — an ORDER row for every order-status change, including `CONFIRMED → SHIPPED`.
**Actual** — the status silently became `SHIPPED` (verified in the badges immediately after fulfilment), but only a FULFILMENT event was logged:

```
ORDER: — → PENDING                          8 Sept 2026, 8:44 am
ORDER: PENDING → CONFIRMED                  8 Sept 2026, 8:44 am
ORDER: CONFIRMED → ON_HOLD                  8 Sept 2026, 8:45 am
ORDER: ON_HOLD → CONFIRMED                  8 Sept 2026, 8:46 am
FULFILMENT: UNFULFILLED → FULFILLED         8 Sept 2026, 8:46 am     <-- no ORDER: CONFIRMED → SHIPPED
ORDER: SHIPPED → COMPLETED                  8 Sept 2026, 8:46 am     <-- "from SHIPPED" with no record of getting there
```

The last row referring to a `SHIPPED` state that the timeline never recorded is what makes the gap
visible. Hold, resume, cancel and close are all logged correctly.
**Root Cause** — the fulfil handler writes a `FULFILMENT` timeline event and mutates
`order.status` to `SHIPPED` without also writing an `ORDER` event.
**Suggested Fix** — emit an `ORDER` timeline event whenever `status` changes, ideally from one
helper so no future transition can skip it.
**Retest Status** — **FIXED — retested end-to-end at the API and confirmed visually in the
console UI.** `OrderService.fulfil()` now also writes an `ORDER` history row whenever `order.status`
actually changes during that call. New order placed via COD (auto-confirmed), fulfilled via
`POST /console/orders/{id}/fulfil`, then read back:
```
ORDER: — → PENDING                 CUSTOMER
ORDER: PENDING → CONFIRMED         SYSTEM
FULFILMENT: UNFULFILLED → FULFILLED USER
ORDER: CONFIRMED → SHIPPED         USER      <-- now present
```
`/orders/{id}` in the console now renders the Timeline card with `ORDER: CONFIRMED → SHIPPED`
immediately after `FULFILMENT: UNFULFILLED → FULFILLED`, closing exactly the gap shown in this
report's evidence.

---

## BUG-FE-019 (P3) — The products table renders an empty "Actions" column for roles with no row actions

**Module/Page:** `/products`.
**User/Tenant:** `ops@northwind.test` (ORDER_MANAGER) / `northwind`. **Environment:** as above.

**Expected** — the column is omitted when the user has none of `product:update`, `product:delete`, `product:publish`, as the coupons, customers and inventory tables already do (`colSpan={canDelete ? 6 : 5}` etc.).
**Actual** — the header renders with an empty cell in every row:

```js
{ headers: ["Product","Status","Price","Updated","Actions"],
  editButtons: 0, deleteButtons: 0, publishButtons: 0, rowCount: 20 }
```

**Root Cause** — the `Actions` `TableHead` is unconditional in `products/page.tsx`, unlike the other list pages.
**Suggested Fix** — render it only when `canUpdate || canDelete || canPublish`, and adjust `colSpan` accordingly.
**Retest Status** — **FIXED, but only partly retestable live — noting the gap honestly.** Added
`canShowActions = canUpdate || canDelete || canPublish`, made the `Actions` `TableHead`/`TableCell`
conditional on it, and adjusted `colSpan` to 4/5 accordingly — the same pattern already used on
`coupons/page.tsx` (`{canDelete && <TableHead />}`), which this fix mirrors exactly.
Live-retested the *positive* case: signed in as `owner@northwind.test` (all three perms), the
Actions column and its Publish/Edit/Delete buttons render as before — no regression.
Could **not** live-retest the *negative* case (column disappearing) with the credentials
available: re-checked `PERMISSION_MATRIX.md` and confirmed no seeded role in this tenant holds
`product:read` without at least one of `update`/`delete`/`publish` while also holding `store:read`
— and `/products` has its own pre-existing, unrelated gate that returns "No store found" before
the table ever renders for any role without `store:read` (every role except Owner/Admin). There is
no role management API to construct a custom test role, so this specific branch could not be
exercised through the real UI. Confirmed correct by static review and a clean `tsc --noEmit`.

---

## BUG-FE-020 (P3) — Mobile cart controls are below the minimum touch-target size

**Module/Page:** Storefront `/cart` at a 375px viewport.
**User/Tenant:** anonymous / `northwind`. **Environment:** as above.

**Expected** — at least 44×44 px (WCAG 2.5.5 / Apple) or 48×48 dp (Android) for touch controls.
**Actual** — measured `getBoundingClientRect()` on the rendered cart:

```
"Remove Standing Desk C…"  28x28      <-- destructive action, well under the minimum
"Decrease quantity"        36x34
"Increase quantity"        36x34
"Apply" (coupon)           71x40
```

The undersized Remove button is the most concerning, since it is destructive and adjacent to the
quantity controls. For contrast, "Place order" on `/checkout` is 353×48 — correctly sized.

Also verified while measuring, and explicitly **not** a bug: no element on the mobile cart
overflows (`0` overflowing leaf elements measured against `innerWidth`). Apparent right-edge
clipping in a screenshot was a viewport-emulation artifact — the layout computed at 411px while
the frame captured 375px (`document.clientWidth` 375 / `visualViewport.width` 375 vs
`innerWidth` 411).
**Root Cause** — icon buttons sized from the icon rather than to a minimum tap area.
**Suggested Fix** — give the cart's icon buttons `min-height`/`min-width` of `44px` (or padding to reach it) at mobile breakpoints.
**Retest Status** — **FIXED — retested live at a 375px mobile viewport**, same measurement method
as the original report:
```
Remove       44x44   (was 28x28)
Decrease     44x44   (was 36x34)
Increase     44x44   (was 36x34)
```
First pass used `h-full` inside an `h-11` bordered container, which landed at 44×42 (the 1px
top/bottom border ate into the button's content-box height) — caught by re-measuring after the
first fix, then corrected by putting `min-h-11` directly on each button instead of relying on the
container's `h-full`. All three controls now measure exactly 44×44px.

---

## BUG-FE-021 (P3) — Dialogs do not set `aria-modal`

**Module/Page:** all 8 dialogs (`apps/console/src/components/ui/primitives.tsx:447-480`).
**User/Tenant:** any / any. **Environment:** as above.

**Expected** — `aria-modal="true"` on the dialog element, so assistive technology confines the user to it.
**Actual** — the attribute is absent:

```js
{ dialogAttrs: { role: "dialog", ariaModal: null, dataState: "open" } }
```

Everything else about the dialogs is correct and was verified live: focus moves inside on open
(landing on Cancel), the focus trap holds through 7 Tabs, Escape closes (real `keydown`),
Cancel / X / outside-click all close with no side effect, and the focus ring is visible. So this
is a single missing attribute on an otherwise well-behaved component.
**Root Cause** — the `Dialog` wrapper does not pass `aria-modal` to `DialogPrimitive.Content`.
**Suggested Fix** — add `aria-modal="true"` in the shared primitive; it fixes all 8 dialogs at once.
**Retest Status** — **FIXED — retested live in the browser.** Added `aria-modal="true"` to
`DialogPrimitive.Content` in `primitives.tsx`. Opened the Sessions page's Revoke confirmation
dialog (added for BUG-FE-017) and read its attributes directly:
`{ role: "dialog", ariaModal: "true", dataState: "open" }` — fixed for that dialog, and since
every dialog in the console (product/coupon delete, this new revoke confirm, etc.) shares this
same `Dialog` primitive, the fix applies to all of them at once as intended.

---

## BUG-FE-022 (P3) — A user-facing validation message leaks internal schema language

**Module/Page:** `/products/new`.
**User/Tenant:** `owner@northwind.test` / `northwind`. **Environment:** as above.

**Steps** — create a product with Name and Price filled and SKU left blank.

**Expected** — "SKU is required".
**Actual** — the server's schema-refine message is shown verbatim under the SKU field:

```
POST /api/v1/console/console/products -> 422
inline error: "sku is required unless type is VARIABLE"
```

The form only ever creates `type: 'SIMPLE'` products and has **no** type control, so the
condition it names is meaningless to the merchant, and the lower-case field name reads like a
developer message. Worth noting the surrounding behaviour is *good*: the 422 is correctly mapped
to the right field and rendered inline — this is purely wording.

Secondary point: because the form's resolver is built from `.innerType().innerType()`, the
cross-field refine is stripped client-side, so SKU is not marked required in the browser and the
requirement is only discovered after a server round-trip.
**Root Cause** — the contract's `.refine()` message is written for API consumers; the form
surfaces it unchanged.
**Suggested Fix** — reword the contract message to "SKU is required" (the VARIABLE nuance belongs
in the API docs), and mark SKU as required in the form schema so it is caught before submitting.
**Retest Status** — **FIXED — retested live in the browser.** Reworded the contract refine's
message to `"SKU is required"` (`product.contracts.ts`), and added `sku: z.string().trim().min(1,
'SKU is required')` to the form's own schema in `products/new/page.tsx` so it's caught client-side.
Repro re-run: Name `QA Retest Product`, Price `abc` (also invalid), SKU left blank, submit →
inline `sku-error: "SKU is required"` (merchant-facing, no lower-case field name, no VARIABLE
mention) rendered **before any request was sent** — confirmed via network log (no
`POST /console/products` fired for that click). Filled in a valid SKU and price afterward and the
product created successfully.

---

## Appendix A — BLOCKED, not bugs

Recorded so they are not mistaken for defects. Each is an environment limitation already on
record in `QA_REPORT.md` §5.

| # | Item | Why |
|---|---|---|
| BLOCKED-1 | Dashboard "Net revenue" / "Orders" tiles, their deltas and sparklines, and the Customers new/returning hint | These read the pre-aggregated `daily_sales_rollup` table, which is written **only** by `apps/api/src/queues/processors/analytics-rollup.processor.ts` — a BullMQ processor. With no queue Redis on port 6380 the rollup never runs, so the dashboard showed `₹479.98 / 1 order` while 23 orders existed. Verified this is *not* a code defect: `confirmed_at` is correctly populated on all 19 orders checked, and the rollup SQL (`DATE(confirmed_at)` + `status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED','COMPLETED','RETURNED')`) would match them. |
| BLOCKED-2 | Dashboard notification list, unread badge, "Mark read" button, notification `actionUrl` link | Notifications are queue-produced; zero exist, so the panel only ever shows its empty state. |
| BLOCKED-3 | Inventory stock transfer between warehouses | `northwind` has exactly one warehouse (`Main Warehouse`) and no console UI creates warehouses. The dialog's validation was fully tested and passes, including the same-warehouse refine. |
| BLOCKED-4 | Email delivery for password reset, email verification and staff invitations | No SMTP. Independently, all three pages are unreachable — BUG-FE-001. |
| BLOCKED-5 | Storefront product-detail and catalogue interactive elements | BUG-FE-003. Their API behaviour was verified separately (add-to-cart, quantity, coupon, review submission all correct). |
| BLOCKED-6 | Media/image upload | No MinIO, and no console UI exists for it. |
| BLOCKED-7 | MFA login path (4 elements) | No MFA-enabled account exists, and enabling MFA on a seeded account would have modified data outside this phase's scope. |

## Appendix B — Verified NOT to be bugs

Checked because they looked suspicious, and cleared. Recorded so no one re-investigates them.

| Observation | Finding |
|---|---|
| Brand dropdown on the product form shows only "None" | Correct — `GET /console/brands` genuinely returns `[]` for northwind. (There is no UI to create brands, but that is a NOT IMPLEMENTED vertical, not a bug.) |
| Storefront catalogue showed `ratingAverage 0.00 / count 0` while the product detail showed `5.00 / 1` right after a review was approved | Cache TTL on the storefront product list. Re-polled three times: it caught up to `5.00 / 1` on its own. Expected caching behaviour. |
| A 150% coupon might produce a negative order total | It does not — the discount is clamped to the subtotal (`discount 19999` on a `19999` subtotal → total `0`), and the placed order charged `₹80.00` (shipping + COD). The validation gap is real (BUG-FE-010); a negative charge is not possible. |
| `ORDER_MANAGER`'s JWT appeared to carry zero permissions | A decoding mistake on my part — the claim is `perms`, not `permissions`. It correctly carries 22, and `owner@northwind.test` carries 160. |
| `Escape` did not close a dialog on the first attempt | A tool input-delivery artifact. A real `keydown` event closes it correctly, and focus is properly trapped inside the dialog. |
| The customer detail page hung on "Loading…" for ~11s | The API dev server hot-restarted mid-test (PID 17672 → 1936), producing `ERR_CONNECTION_REFUSED`. The page then rendered its correct "This customer could not be found." state. Not a page defect. |
| Right-edge clipping on the mobile cart screenshot | Viewport-emulation artifact (layout at 411px, frame at 375px). Measured `0` overflowing elements. |
| Getting signed out during the Sessions test | Correct behaviour — I revoked a session in my own refresh-token family, which properly invalidated my login. Good end-to-end evidence that revocation works. |

## Appendix C — Fix order suggested

1. **BUG-FE-001** — one-line condition; unblocks three whole workflows. Highest value per effort by a wide margin.
2. **BUG-FE-007 / 008** — one shared pattern (add an error branch to six list pages); also removes the false "no store" message.
3. **BUG-FE-002** — needs a real repository predicate on five modules; consider hiding the three search inputs in the meantime.
4. **BUG-FE-004 / 005 / 006 / 009** — the "silent failure" family; all are small, local form fixes.
5. **BUG-FE-011** — a contract change (`paymentGateway` on the pricing schema) plus a summary row.
6. **BUG-FE-003** — re-verify against a production build **before** writing any code.
7. **BUG-FE-010, 012** — small, self-contained.
8. **P3s** — BUG-FE-013 and BUG-FE-021 are each a single shared-primitive change that fixes many call sites; do those two first.
