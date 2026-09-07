# Dashboard — UX audit and redesign spec

Scope: the merchant console's landing route (`apps/console/src/app/(app)/page.tsx`), the
shared primitives it is built from, and the design tokens underneath both. Written
against the implementation that landed with it, so the code and this document describe
the same screen.

Out of scope, deliberately: the app shell's navigation model, and every other list or
detail page. Both are named in §3 as follow-on work.

---

## 1. Current UX problems

The route that a merchant lands on after signing in was a Phase-1 infrastructure health
check. Component name: `StatusPage`.

| # | Problem | Evidence |
|---|---|---|
| P1 | **The landing page contains no business data at all.** It polls `GET /health/ready` every 10 s and `GET /health/startup` once, and renders dependency status dots with millisecond latencies, a migration status line, and a Swagger link. | `(app)/page.tsx`, all 142 lines |
| P2 | **The page tells the merchant the product is unfinished.** Body copy read "Phase 1 foundation. Authentication and the merchant dashboard arrive in Phases 2–3." | ibid., header block |
| P3 | **Real aggregates exist and are unused.** `console/reports/sales-summary` returns orders, gross/net/tax/discount/refund, new vs returning customers, and a `byDay` series. `console/inventory/low-stock` and `console/notifications` are equally unreferenced by any page. | `report.contracts.ts`, `notification.controller.ts` |
| P4 | **No loading state has a shape.** Every async section in the console renders either a bare `Loading…` string or a centred spinner, then the content appears at full size. | `orders/page.tsx:39`, `inventory/page.tsx:33` |
| P5 | **No empty state distinguishes "nothing yet" from "broken".** A new tenant would see `₹0.00`, `0`, `0` and three empty tables, with nothing saying which of those is expected. | absent by construction |
| P6 | **The nav gave no indication of the current page.** Seven flat text links, `hover:text-foreground`, no active styling, no `aria-current`. "Status" occupied the first slot. | `(app)/layout.tsx:57–79` |
| P7 | **Every boundary is a 1px border.** `Card` is `rounded-lg border shadow-sm`; `Table` adds its own `border`; a table inside a card therefore draws two. Elevation existed only as Tailwind's default `shadow-sm`. | `primitives.tsx`, `Card`/`Table` |
| P8 | **The dark palette was dead code.** The `.dark` block was written inside `@layer base`. Tailwind purges *class* selectors inside a layer unless the class name appears in `content`, and no file in the app uses a `dark:` variant or the literal class — so `.dark` never reached the compiled stylesheet. Adding `class="dark"` to `<html>` changed nothing. Verified in the browser: `document.styleSheets` contained zero rules matching `.dark`. | `globals.css`, pre-change |
| P9 | **No skeleton, stat, empty-state, or chart primitive existed**, so any dashboard would have invented its own in page scope. The primitives file said so itself: "The full library arrives with the dashboard in Phase 3." | `primitives.tsx:18–24` |
| P10 | **`CardHeader` renders `<h1>` unconditionally**, at ~20 call sites, several of them nested under a page that already has an `<h1>`. | `primitives.tsx:197` |
| P11 | **No keyboard skip link**; reaching page content meant tabbing the whole nav on every load. | `(app)/layout.tsx` |
| P12 | **Nothing honoured `prefers-reduced-motion`**, and there was no motion vocabulary to honour it with. | `globals.css` |

## 2. Why they are problems

**P1/P2 — the landing page answers a question nobody asked.** A merchant opens an admin
console to learn three things: how trade is going, what needs doing, and what changed
while they were away. Redis latency is none of those. This was a reasonable Phase-1
choice — a live health check proves the whole chain came up, where a "Welcome" placeholder
proves nothing — but the cost has inverted now that there is real data to show. P2 is
worse than merely unhelpful: a page that describes its own roadmap reads, to anyone being
shown the product, as a prototype.

**P3 — unused aggregates are the expensive kind of waste.** The rollup table, the daily
aggregation job and the summary endpoint are all built and tested. The only missing piece
is the ~40 lines of query hook that read them.

**P4 — a spinner withholds the two things a loading state should convey**: how much is
coming, and where it will land. It also guarantees a layout shift, because nothing
reserves the space the content will occupy. On a dashboard with six independent queries
this is at its worst: six spinners resolve at six different moments and the page
rearranges after each one.

**P5 — zero is ambiguous.** `₹0.00` is simultaneously the correct answer for a store that
has made no sales and the symptom of a broken query. Only the merchant's own context
disambiguates it, and a new merchant does not have that context yet. First-run is also the
state every demo and every trial account starts in, so it is the state most likely to be
seen by someone deciding whether to keep using the product.

**P6 — "where am I" is the cheapest question a UI can answer**, and the flat nav answered
it for nobody: not visually, and not for assistive technology, which received no
`aria-current` and so had no way to convey the current page at all.

**P7 — borders do not compose.** One is invisible; twelve are a cage. Nested borders
(card + table) also produce visible double lines and mismatched corner radii. The
reference products (Stripe, Linear, Vercel) separate surfaces with a barely-perceptible
shadow and a background shift, reserving actual lines for genuine dividers inside a
surface — which is why their screens read as calm at high information density.

**P8 — a theme that cannot be enabled is not a theme.** Every dark value had been chosen,
reviewed and committed, and none of it had ever rendered. This one is worth dwelling on
because the failure mode is silent: the CSS is syntactically valid, the tokens are
correct, nothing warns, and the only symptom is that a feature nobody had tried yet did
not work.

**P9 — the first page to need a pattern decides it for every later page.** Building the
dashboard's skeletons and metric tiles inline would have made the dashboard the place
future pages copy from, which is how a design system ends up living in page files.

**P10 — heading level is document structure, not typography.** Screen-reader users
navigate by heading outline; a row of sibling `h1`s flattens it. But the same code is why
this cannot simply be changed: several call sites (`login`, `forgot-password`,
`accept-invite`) use `CardHeader` as the *only* heading on the page, and flipping the
default to `h2` would leave those documents with no `h1`.

**P11/P12 — accessibility, straightforwardly.** A keyboard user pays the nav tax on every
navigation. And a dashboard that staggers a dozen panels into view is exactly the pattern
that triggers vestibular symptoms, so the animation vocabulary and the opt-out have to
arrive together.

## 3. Proposed redesign

### Landing route

Replace the health check with a real dashboard. **Relocate, do not delete**: the health
check moves to `/system` unchanged in behaviour. It remains a genuinely useful smoke test
— loading it exercises Next.js → API → MySQL, Redis and MongoDB in one request — it simply
does not deserve the landing slot.

### Information architecture

Three regions, mapping to the three questions above:

1. **Page header** — title, a personalised subtitle naming the store, a reporting-period
   control (7/30/90 days, since `sales-summary` requires `from`/`to`), and one primary
   action.
2. **Stat row** — four tiles: net revenue, orders, customers, products.
3. **Working area** — recent orders (2/3 width) beside a stacked alerts column (1/3):
   low stock, then activity.

### What is *not* on this page, and why

| Not built | Reason |
|---|---|
| Top products / top customers | **No endpoint exists.** Neither aggregate is computable from anything the API exposes. |
| Conversion rate, AOV trend, sessions | No metric exists. `console/analytics/funnel` exists but answers a different question; it belongs on a dedicated analytics page with its own date semantics, not as a tile whose label would have to overstate what it measures. |
| "Create order" CTA | **There is no `orders/new` route.** The primary action is "Add product" → `/products/new`, which does exist. |
| Store switcher | `useCurrentStore()` deliberately takes the first store; the codebase documents single-store-per-tenant as the current assumption. |

This table is the load-bearing part of the redesign. A dashboard's credibility is
destroyed by one plausible number that turns out to be invented, and the temptation to
fill a fourth grid cell with a conversion rate is exactly how that happens.

### Data sources (all verified against the running API)

| Element | Source | Notes |
|---|---|---|
| Net revenue, orders, items, new/returning customers, sparklines | `GET console/reports/sales-summary?from&to&storeId` | `report:read`. Not a paginated envelope — use `apiGet`. |
| Deltas | the **same endpoint** over the preceding equal-length window | Two reads off a pre-aggregated rollup. This is what makes "+12.4% vs prev 30d" a real number rather than a decorative one. |
| Customer / product totals | `useCustomers({page:1,limit:1})`, `useProducts({page:1,limit:1,storeId})` | The row is discarded; only `meta.pagination.total` is read. Cheapest real count available. |
| Recent orders | `useOrders({page:1,limit:5,storeId})` | Server default sort is `createdAt DESC` (`orderListQuerySchema`), so newest-first needs no extra parameter. |
| Low stock | `useLowStock()` | Plain array. `InventoryLevelResponse` carries only `productId`, so each row resolves its name via `useProduct` — the same pattern the inventory page already uses. |
| Activity | `GET console/notifications?limit=6` + `POST .../:id/read` | `notification:read`. Returns a **plain array** despite accepting `page`/`limit` — the controller's return type is `NotificationResponse[]`, so `apiGetPaginated` would yield `data: undefined`. |

### Permission behaviour

`report:read` and `notification:read` are checked with `usePermission` **before** the
query is enabled, rather than letting requests 403 on every mount. A role without
`report:read` sees the revenue and orders tiles render `—` with the hint "Reporting access
required"; the activity panel is omitted entirely without `notification:read`. Server-side
authorisation is unchanged and remains the actual boundary.

### First-run state

When `products.total === 0` **and** `orders.total === 0`, the entire grid is replaced by a
three-step setup card (add a product → set reorder points → watch orders arrive), each
step linking to the route that performs it and the first step gated on `product:create`.
Four zeros above a setup prompt would be strictly worse than the prompt alone.

The intermediate case — products exist, no sales in the selected window — keeps the normal
layout: the figures are genuinely zero and correctly labelled, and the recent-orders panel
carries its own empty row.

### Design-system changes

**Tokens** (`globals.css`): elevation (`--shadow-xs/card/raised/overlay`, structurally
different in dark — an inset top highlight, since there is nothing lighter behind a dark
surface to darken); motion (`--duration-fast/base/slow`, `--ease-out`); `Inter` prepended
to `--font-sans` ahead of the previous stack verbatim, so machines that have it get better
numerals and everything else renders exactly as before with no webfont request; a global
`prefers-reduced-motion` block; a `.display` utility (tabular figures, −0.02em tracking).

**The P8 fix**: the `:root` and `.dark` token blocks move *out* of `@layer base`, along
with `.tabular` and `.display`. This is not formatting — it is the whole reason the dark
theme now works.

**Primitives** — additive, in the existing file, following its existing conventions (`cva`
where variants exist, plain functions otherwise, tokens only):

- New: `Skeleton`, `SkeletonText`, `StatCard` + `StatDelta`, `EmptyState`, `Sparkline`.
- Refined: `Button` gains `secondary`, `icon`/`icon-sm`, `asChild`, and a press affordance;
  `Card` gains `variant` (`default` unchanged / `elevated` / `plain`); `CardHeader` gains
  `action` and `as`; `Badge` gains `info`; `Table`/`TableHeader`/`TableBody` accept
  `className`.

`Sparkline` is deliberately hand-rolled. The requirement is "map n numbers onto a
polyline"; a charting library would add axes, tooltips and a few hundred kilobytes to draw
30 points at 32px tall. When a real analytics page needs axes and hover, that is the moment
to add one.

### Shell changes — kept minimal on purpose

Active-route highlighting with `aria-current="page"`; nav reordered (Dashboard first,
operational pages last) with "Status" renamed "System" at `/system`; a sticky translucent
header; a skip link; and `overflow-x-auto` on the nav so eight items scroll within their
row instead of giving the whole document a horizontal scrollbar at 375px.

**Deferred, and recommended for a later round:** a collapsing sidebar with a per-item icon
set, a command palette (⌘K), a notification bell with a dropdown feed, breadcrumbs on
detail routes, a light/dark toggle now that dark actually renders, and flipping
`CardHeader`'s default to `h2` after auditing the ~20 call sites (P10). Eight top-level nav
items is already past the point where a horizontal bar is the right shape — but rebuilding
the nav is a change with its own audit, and bundling it here would have made both harder to
review.

## 4. UX reasoning

**Why four stat tiles and not eight.** Four is what fits one row at this container width
without shrinking below a legible number size, and the marginal tile is always the weakest
one. Revenue and orders are the two figures a merchant checks daily; customers and products
are context. Anything further down that list is a reason to visit a dedicated page.

**Why the delta is real or absent.** A percentage against a period the merchant can name
("vs prev 30d") is actionable. A percentage against an unstated baseline is decoration.
Where the baseline is zero the tile says "No prior data" rather than "+100%", because the
first sale is not a hundred-percent increase and rendering one would be inventing a number.
`DeltaBadge` rounds *before* testing for zero, so ±0.4% shows as flat instead of a green
arrow next to a figure that displays as "0.0%".

**Why revenue is `netMinor`, not `grossMinor`.** Net is what the merchant keeps. Gross next
to net in the same tile would need explaining; the tile carries the number that answers
"how did we do".

**Why the recent-orders table is 2/3 width and the alerts stack 1/3.** Orders is the region
merchants act from, and a table needs horizontal room. Low stock and activity are scan-and-
dismiss, which is what a narrow column is good at. It also means the low-stock panel is a
list rather than a table — five numeric columns at ~300px would either scroll sideways or
truncate the product name, which is the one field being scanned for.

**Why the period control sits in the page header.** It governs the whole page, so it
belongs at page level, not inside one card. Selecting a period refetches both the current
and baseline summary; the stat tiles show skeletons while the tiles that do not depend on
the period keep their values, which localises the change to the parts that actually changed.

**Why "Add product" and not "Create order".** Because `/orders/new` does not exist. A
primary CTA that 404s is worse than no CTA.

**Why colour is never the only signal.** Delta arrows are paired with an `sr-only`
"up"/"down"; the out-of-stock colour accompanies a number that is visibly `0`; unread
notification dots are paired with `sr-only "Unread."`; the `/system` dependency dots gained
`sr-only` "up"/"down" text. Colour is the fastest carrier of meaning and the least
reliable, so it is used as an accelerant and never as the message.

## 5. Wireframe

Desktop, ≥1024px (container `max-w-5xl`):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ EMS  [Dashboard] Orders Products Inventory …      Nadia / Northwind [Sign out]│ ← sticky, translucent
└──────────────────────────────────────────────────────────────────────────────┘

  Dashboard                                        ┌─────────────┐ ┌───────────┐
  Welcome back, Nadia. Here is Northwind Main Store.│Last 30 days▾│ │+ Add prod.│
                                                   └─────────────┘ └───────────┘

  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
  │ NET REVENUE ₹ │ │ ORDERS      🛍 │ │ CUSTOMERS   👥 │ │ PRODUCTS    📦 │
  │               │ │               │ │               │ │               │
  │ ₹479.98       │ │ 1             │ │ 1             │ │ 1             │
  │ ↗2.4% vs 30d  │ │ ↗8.0% vs 30d  │ │ 0 new, 0 ret. │ │ 1 low on stock│
  │ ╭─╮  ╭╮   ╭── │ │ ─╮ ╭──╮  ╭──  │ │               │ │               │
  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
   ← shadow, no border. sparkline only where ≥2 real data points exist →

  ┌────────────────────────────────────────────┐ ┌────────────────────────┐
  │ Recent orders                    View all  │ │ Low stock          [1] │
  ├────────────────────────────────────────────┤ ├────────────────────────┤
  │ ORDER      STATUS     TOTAL       PLACED   │ │ Test Widget         13 │
  │ ORD-000001 [SHIPPED] ₹479.98  7 Sep, 2:38a │ │ Main Warehouse   of 20 │
  │ shopper@…                                  │ │ ───────────────────────│
  │ ORD-000002 [PENDING] ₹120.00  6 Sep, 9:14p │ │ Blue Mug             2 │
  │ …                                          │ │ Main Warehouse   of 15 │
  │ (5 rows, or one empty row)                 │ │ 2 more                 │
  └────────────────────────────────────────────┘ └────────────────────────┘
        table has no border of its own —        ┌────────────────────────┐
        the card already draws the boundary     │ Activity      [2 new]  │
                                                ├────────────────────────┤
                                                │ • Order shipped        │
                                                │   ORD-000001 …  2h ago │
                                                │              [Mark read]│
                                                │   Payment captured     │
                                                │   ₹479.98 …     3h ago │
                                                └────────────────────────┘
```

Loading (before any data resolves — same boxes, no reflow on arrival):

```
  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
  │ ▓▓▓▓▓▓        │ │ ▓▓▓▓▓▓        │ │ ▓▓▓▓▓▓        │ │ ▓▓▓▓▓▓        │
  │ ▓▓▓▓▓▓▓▓▓▓    │ │ ▓▓▓▓▓▓▓▓▓▓    │ │ ▓▓▓▓▓▓▓▓▓▓    │ │ ▓▓▓▓▓▓▓▓▓▓    │
  │ ▓▓▓▓▓▓▓▓      │ │ ▓▓▓▓▓▓▓▓      │ │ ▓▓▓▓▓▓▓▓      │ │ ▓▓▓▓▓▓▓▓      │
  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
      ↑ shimmer sweeps left→right, aria-hidden, container aria-busy
```

First run (no products **and** no orders):

```
  Dashboard                                        [Last 30 days▾] [+ Add product]

  ┌──────────────────────────────────────────────────────────────────────────┐
  │ Set up your store                                                        │
  │ There are no products or orders yet, so there is nothing to report on.   │
  │ Three steps and this page fills in.                                      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │ ① Add your first product                                  [Add product]  │
  │   Name, SKU and price are enough to start. …                             │
  │ ② Set stock levels                                     [Open inventory]  │
  │   Give each product a reorder point so this dashboard can warn you …     │
  │ ③ Watch orders arrive                                     [View orders]  │
  │   Revenue, order counts and customer activity all appear here once …     │
  └──────────────────────────────────────────────────────────────────────────┘
```

Mobile, 375px:

```
┌───────────────────────────────┐
│ EMS [Dashboard] Orders Pr→ [Sign out]│ ← nav scrolls inside its own row;
└───────────────────────────────┘         identity hidden below sm
  Dashboard
  Welcome back, Nadia. …
  [Last 30 days ▾] [+ Add product]   ← wraps to its own line at full size

  ┌─────────────────────────────┐
  │ NET REVENUE               ₹ │
  │ ₹479.98                     │
  └─────────────────────────────┘
  ┌─────────────────────────────┐
  │ ORDERS                    🛍 │  … 1 column, then
  └─────────────────────────────┘     Recent orders → Low stock → Activity
```

## 6. Component hierarchy

```
app/(app)/layout.tsx  ── AppLayout
├── a[href="#main"]                        "Skip to content"
├── header (sticky, backdrop-blur)
│   ├── Link "EMS"
│   ├── nav[aria-label="Main"] (overflow-x-auto)
│   │   └── NavLink × 8                    aria-current="page" when active
│   └── Button "Sign out"                  + identity block (hidden < sm)
└── div#main
    └── app/(app)/page.tsx  ── DashboardPage
        ├── PageShell                      h1 + description + actions slot
        │   ├── Select                     reporting period (labelled, sr-only label)
        │   └── Button asChild > Link       "Add product"  [product:create]
        │
        ├── DashboardSkeleton              while the store resolves; aria-busy
        │
        ├── FirstRunPanel                  when products.total === 0 && orders.total === 0
        │   └── Card(elevated) > CardHeader + ol > li × 3 > Button asChild > Link
        │
        └── (normal state)
            ├── section[aria-label="Key metrics"]         grid 1 / 2 / 4
            │   └── StatCard × 4
            │       ├── Skeleton            while loading
            │       ├── DeltaBadge          real % or "No prior data"
            │       └── Sparkline           chart slot; null below 2 points
            └── div  grid lg:grid-cols-3
                ├── RecentOrders            lg:col-span-2
                │   └── Card(elevated)
                │       ├── CardHeader as="h2" action=<Link "View all">
                │       └── Table(border-0) > TableHeader/TableBody
                │           ├── 5 × skeleton rows | TableEmptyRow | data rows
                │           └── Badge (STATUS_BADGE) · formatMoney · formatDate
                └── div space-y-4
                    ├── LowStockPanel
                    │   └── Card(elevated) > CardHeader as="h2" action=<Badge count>
                    │       └── ul > li > LowStockRow → useProduct(productId)
                    └── ActivityPanel                      [notification:read]
                        └── Card(elevated) > CardHeader as="h2" action=<Badge "n new">
                            └── ul > li × n
                                ├── unread dot + sr-only "Unread."
                                ├── Link (internal actionUrl only) | plain text
                                └── Button "Mark read" → useMarkNotificationRead
```

Primitives added to `components/ui/primitives.tsx`: `Skeleton`, `SkeletonText`,
`EmptyState`, `Sparkline`, `StatCard`, `StatDelta` (type), `DeltaBadge` (private).

Query hooks added: `lib/queries/reports.ts` (`useSalesSummary`),
`lib/queries/notifications.ts` (`useNotifications`, `useMarkNotificationRead`).
No existing hook was modified.

## 7. Responsive behaviour

| Breakpoint | Stat row | Working area | Shell |
|---|---|---|---|
| `< 640px` | 1 column | 1 column: orders → low stock → activity | nav scrolls inside its row; identity block hidden; header controls wrap to their own line at full size |
| `640–1023px` (`sm`) | 2 columns | 1 column | identity block visible |
| `≥ 1024px` (`lg`) | 4 columns | 3-col grid; orders `col-span-2`, alerts stack in col 3 | full header |

Rules that matter more than the table:

- **The document never scrolls horizontally.** The overflow is contained where it occurs:
  `overflow-x-auto` + `min-w-0` on the nav, and the `Table` primitive's own scroll
  container for wide rows. Verified at 375px: `scrollWidth === clientWidth === 375`.
- **Timestamps are `whitespace-nowrap`.** A wrapped "7 Sept 2026, 2:38 am" turns a 5-row
  table into a 12-row one; letting the table scroll instead is the better trade.
- **The header wraps rather than shrinks**, so the primary CTA never compresses until its
  label truncates.
- **`Sparkline` needs no resize handling** — a fixed `viewBox` with
  `preserveAspectRatio="none"` and `vectorEffect="non-scaling-stroke"` stretches to any
  width while keeping the stroke 1.5px.
- **Truncation is explicit** (`truncate`, `line-clamp-2`, `min-w-0` on flex children), so
  a long product name or notification body shortens instead of widening its container.

## 8. Accessibility improvements

Landmarks and structure
- `nav[aria-label="Main"]`, `#main` wrapper, `section[aria-label="Key metrics"]`.
- Skip link, visible on focus only (`sr-only focus:not-sr-only`).
- Heading outline is a tree: page `h1`, panels `h2` via `CardHeader as="h2"`. Verified in
  the browser accessibility tree.

State conveyed in more than one channel
- `aria-current="page"` on the active nav item, alongside the colour/background change.
- Delta arrows carry `sr-only` "up" / "down" / "unchanged".
- Unread notifications carry `sr-only "Unread."` beside the dot.
- `/system` dependency dots gained `sr-only` "up" / "down".
- Out-of-stock uses `text-destructive` **and** shows the number.

Loading
- `Skeleton` is `aria-hidden`; the container carries `aria-busy` and one `role="status"`
  announcement. A dozen announced placeholder boxes is worse than silence.

Focus
- Every interactive element has a visible `focus-visible` ring; the Button base adds
  `focus-visible:ring-offset-background` so the offset ring works on both themes.
- Links styled as buttons use `asChild` and render a real `<a>`, keeping middle-click,
  right-click and "open in new tab" — and avoiding an anchor nested inside a button.

Forms and motion
- The period `Select` has a real `<label htmlFor>` (`sr-only`).
- "Mark read" buttons append `sr-only ": <title>"`, so five identically-named buttons are
  distinguishable out of context.
- Global `prefers-reduced-motion` block collapses durations to ~0 rather than removing
  animations, so anything relying on `animationend` still fires.

Contrast
- Text colours are the existing token pairs, unchanged. Dark mode now actually renders
  (§P8), which means the dark palette is testable for the first time — the values were
  chosen for contrast but had never been on screen.

Known gaps
- The `Sparkline` is `aria-hidden` decoration; the number it trends is always printed
  beside it, and the per-day series has no textual equivalent. A `byDay` table behind a
  disclosure is the fix if that series becomes load-bearing.
- Nav overflow-scroll is reachable by keyboard (focus scrolls the item into view) but has
  no visible affordance that more items exist. The deferred sidebar removes the problem
  rather than papering over it.

## 9. Suggested animations

All durations and easing come from tokens, so simultaneous animations agree. All are
suppressed by the global reduced-motion block.

| Element | Animation | Duration | Reasoning |
|---|---|---|---|
| Stat tiles | `fade-up` (opacity + 4px rise), staggered 0/40/80/120 ms | 280 ms `--ease-out` | Establishes reading order left→right. 4px, not 16px: enough to read as arrival, not enough to look like the page is reflowing. The stagger is small enough that the row still lands as a group. |
| Skeleton | `shimmer` — highlight sweeping left→right, 1.6 s loop | 1.6 s linear | Directional and calm. With eight placeholders on screen, eight opacity pulses read as the page flickering. |
| Skeleton → content | Cross-fade in place | 180 ms | Nothing moves, because the skeleton already occupied the final box. |
| Stat tile hover | `shadow-card` → `shadow-raised` | 180 ms | Lift, not colour: colour is reserved for meaning, and a tile is not a state. |
| Button press | `active:scale-[0.99]` | 120 ms | The only prior feedback was a hover colour, which touch devices never show — a tap had no acknowledgement until the response returned. |
| Nav item | background fade on hover | 120 ms | Fast; anything slower feels laggy on a pointer that is already moving. |
| Low-stock row hover | `bg-muted/60` fade | 120 ms | Marks the whole row as one hit target. |
| Header | translucent + `backdrop-blur` (state, not animation) | — | Keeps content legible as it scrolls under. |
| First-run panel | `fade-up`, no stagger | 280 ms | One element; a stagger would imply a sequence that is not there. |

Explicitly avoided: counting-up numbers (a merchant reading a figure should not have to
wait for it to stop moving, and it makes the value briefly wrong); sparkline draw-on
(re-runs on every refetch and draws attention to decoration); any spinner where a skeleton
fits; page-transition animations (they delay navigation the user already committed to).

## 10. Tailwind implementation notes

**Token consumption.** Colours stay HSL triples consumed as `hsl(var(--x))` through
`theme.extend.colors`, unchanged. Opacity modifiers on tokens (`bg-primary/10`,
`bg-muted/60`, `border-destructive/40`) work because the triples are space-separated —
worth preserving if tokens are ever edited.

**`@layer` and purging — the trap that caused P8.** A *class* selector written inside
`@layer base` is purged unless its name appears in `content`. `:root` survived because it
is not a class; `.dark` did not, because nothing in the app uses `dark:` or the literal
class. Token and utility class blocks (`:root`, `.dark`, `.tabular`, `.display`) are
therefore **unlayered**, and only element selectors (`*`, `body`) and the reduced-motion
media query remain in `@layer base`. Custom-property declarations are unaffected by the
precedence change; if a *rule* is ever added there, remember unlayered CSS outranks every
layer.

**Elevation.** `boxShadow: { xs, card, raised, overlay }` map to the tokens, so one class
gets a structurally different shadow per theme (dark adds an inset top highlight). Tailwind's
own `shadow-sm`/`shadow-md` are untouched, so `Card`'s `default` variant is byte-identical
to before.

**Motion.** `transitionDuration: { fast, base, slow }` and
`transitionTimingFunction: { 'out-soft' }` map to tokens — hence `duration-fast
ease-out-soft` rather than magic numbers. `keyframes`/`animation` add `fade-in`, `fade-up`,
`shimmer`; the pre-existing accordion keyframes are left alone (unused, but a future Radix
accordion will want them).

**Transition property, not `transition-all`.** The Button base transitions an explicit
list (`color,background-color,border-color,box-shadow,transform`). `transition-all` also
animates layout properties, which is what makes a button visibly lurch when its label
changes width.

**Stagger via arbitrary properties**, `className="animate-fade-up [animation-delay:40ms]"`,
rather than inline `style`. Keeps the value in the same place as the animation that uses it
and out of the render path.

**Scrollbar hiding** needs both `[scrollbar-width:none]` (Firefox/standards) and
`[&::-webkit-scrollbar]:hidden` (Chrome/Safari). One alone leaves a visible bar on half of
browsers.

**`cn()` for every merge.** `twMerge` is what lets `Table className="border-0"` actually
beat the base `border` — plain concatenation emits both and the winner depends on
stylesheet order, so a prop override fails silently.

**`cva` for variants, plain props otherwise**, matching the file's existing convention.
`Card`'s `variant` is `cva`; `CardHeader`'s `as` and `action` are plain props, because they
change structure rather than appearance.

**Backwards compatibility rules followed.** Every added prop is optional and every default
reproduces the previous rendering exactly — `Card` defaults to `default`, `CardHeader` to
`as="h1"` (see P10), `Table`'s `className` defaults to nothing. No call site outside the
dashboard, `/system` and the shell was touched, and `tsc --noEmit` is clean.

**Grid over flex for the two main regions.** `grid-cols-3` + `col-span-2` gives a stable
2:1 split without `flex-basis` arithmetic, and collapses to one column with a single
breakpoint prefix.
