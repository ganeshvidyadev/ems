# Mantis Super Admin UI migration

## Read-only audit and scope

The functional source is `apps/console`, a Next.js 15 / React 19 app using Tailwind 3,
Lucide icons, React Hook Form, Zod, React Query, and Radix dialogs. There is no Bootstrap
runtime to reuse. `apps/storefront` is a separate public application and is excluded.
No repository AGENTS.md was found in the console or ancestor directories.

The authenticated layout is `src/app/(app)/layout.tsx`. It retains the existing silent
refresh/loading gate, redirect, destination URL, and logout callback. Its existing
Super Admin predicate is `user.userType === 'PLATFORM' &&
user.roles.includes('PLATFORM_SUPER_ADMIN')`. Only Company themes is role-filtered in
the navigation; all other navigation links are currently unconditional. Page actions
have their own existing `usePermission` checks. All those checks remain intact.

Routes: `/`, `/themes`, `/orders`, `/orders/[id]`, `/products`, `/products/new`,
`/products/[id]`, `/inventory`, `/inventory/[productId]`, `/customers`,
`/customers/new`, `/customers/[id]`, `/coupons`, `/coupons/new`, `/coupons/[id]`,
`/sessions`, `/system`. Authentication routes are `/login` (including MFA),
`/forgot-password`, `/reset-password`, `/verify-email`, and `/accept-invite`.
There are no console pages for users, roles, audit logs, general settings, uploads,
exports, or the CMS modules in the request's example. Do not invent them.

Shared UI lives in `src/components/ui/primitives.tsx`: Button, Field, Input, Select,
Textarea, Alert, Card, CardHeader, CardBody, Badge, Table family, Dialog, Pagination,
Skeleton, EmptyState, StatCard, DeltaBadge, and Sparkline. Pages retain their own
wrappers and data/form logic. Company themes also has native controls and panels.
Dialogs cover deletion, sessions, customer addresses/wishlist, inventory adjustments,
transfers/settings, and order actions. Existing search and filters stay on their pages.
No demo global search, tabs, charts, or notifications are added.

Existing responsive behavior: horizontal header navigation, max-width page containers,
wrapping filters, table scroll containers, and responsive dashboard grids. Some form
grids stay two columns on mobile and dialogs lack viewport height limits.

Pending clarification about shared tenant UI, use the strict requested scope:
Mantis applies only to authenticated platform Super Admins. Shared tenant and
authentication screens retain their appearance. This is a presentation choice only,
not a new authorization gate.

## Local design source

Source: `C:/Users/DELL 10THGEN/Downloads/Mantis-Bootstrap-1.0.0/Mantis-Bootstrap-1.0.0`.
Package declares Bootstrap ^5.3.2. Inspected layout sidebar/topbar/head/footer partials,
dashboard and login HTML, SCSS color/bootstrap/theme variables, sidebar breakpoints,
card/form/table/modal styles, and bundled font assets.

Mantis uses a 260px sidebar, 60px header, mobile drawer below 1025px, #fafafb canvas,
#1890ff primary, white panels, 4px component corners, 14px body text, 25px card
padding, soft active navigation, and a right-edge active marker. Bootstrap grid
breakpoints are 576/768/992/1200/1400px; the shell separately uses 1024px.
Default font is remotely loaded Public Sans; bundled Inter is an available local
alternative. Use only the bundled roman Inter variable font under a unique family
name, so loading it cannot change the existing tenant/login font stack.
Retain installed Lucide outline SVGs instead of copying several icon font families.

## Mapping and implementation sequence

| Existing presentation                       | Mantis mapping                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Authenticated shell                         | Scoped AdminShell with desktop sidebar and mobile Radix drawer               |
| NAV_ITEMS + existing Super Admin theme link | Same labels, URLs, order, and visibility in Mantis sidebar                   |
| Identity / logout                           | Compact header, identity dropdown, original logout callback                  |
| Page wrappers / headings                    | Consistent spacing, route breadcrumbs, responsive content area               |
| Card / StatCard                             | White bordered panels, separated headers, subtle blue icon accents           |
| Table family / Pagination                   | Gray headers, white rows, blue hover, horizontal scrolling                   |
| Field / native inputs / search / selects    | 4px corners, white controls, blue focus rings                                |
| Radix Dialog                                | Mantis panel styling, viewport gutters, vertical scroll; same props/handlers |
| Badge / Alert                               | Semantic tinted backgrounds and readable foregrounds                         |
| Skeleton / EmptyState                       | Shared palette, quieter backgrounds, existing conditions and copy            |
| Company themes native panels                | Scoped native control/panel styling, unchanged save behavior                 |

Implement assets, shell/navigation/header, shared style hooks, dashboard/list/form
coverage, dialog/mobile cleanup, then verification. Theme CSS is scoped to the
Super Admin wrapper and themed portals. No Bootstrap CSS reset, Bootstrap JS,
pcoded.js, Popper, Simplebar, demo assets, or data plugins are imported.

## Verification requirements

Audit changed files for presentation-only changes. Preserve handlers, validators,
query hooks, API clients, auth stores, backend, database, and public website source.
Run existing test, lint, typecheck, build, integration/isolation/e2e scripts where
available. Record failures rather than changing unrelated tooling or weakening tests.
Verify available pages at 1440, 1280, 768, and 375px, plus drawer/dropdown/dialog
keyboard interaction. Distinguish fixture/render verification from live API regression.

## Final implementation and code audit

The scoped Mantis theme covers all 17 existing authenticated routes listed above
when the existing platform Super Admin predicate matches. The shared authentication
screens and tenant console remain unchanged. All 22 existing `page.tsx` files are
unchanged compared with HEAD, normalizing Git checkout line endings.

| File | Classification | Change |
| --- | --- | --- |
| `apps/console/src/app/(app)/layout.tsx` | UI/theme required | Select presentation shell after the unchanged auth gate; pass original user, navigation and logout |
| `apps/console/src/app/layout.tsx` | UI/theme required | Import scoped theme CSS |
| `apps/console/src/components/ui/primitives.tsx` | UI/theme required | Style hooks, portal theme context, keyboard-accessible Super Admin table scroll regions |
| `apps/console/src/components/ui/mantis-admin-shell.tsx` (new) | UI/theme required | Sidebar, topbar, mobile drawer, account dropdown, breadcrumbs and branding |
| `apps/console/src/components/ui/admin-theme.tsx` (new) | UI/theme required | Boolean presentation context for themed portals/table regions |
| `apps/console/src/app/mantis-admin.css` (new) | UI/theme required | Mantis palette, component styling, responsive rules and local font declaration |
| `apps/console/public/themes/mantis/fonts/Inter-roman.var.woff2` (new) | UI/theme required | Only copied theme binary, 227,688 bytes |
| `apps/console/public/themes/mantis/fonts/OFL.txt` (new) | UI/theme required | Official Inter v3.18 license notice |
| `apps/console/public/themes/mantis/ASSETS.md` (new) | UI/theme required | Asset provenance and exclusions |
| This document (new) | UI/theme required | Audit, mapping, scope and verification report |
| `artifacts/mantis-ui/verify.cjs`, results and screenshots (new) | UI verification | Isolated fixture browser checks; never loaded by the application |

Unexpected logic modifications: **none**. No changes to API/backend source,
controllers, services, repositories, database/schema/migrations, auth/session stores,
permission hooks, queries, validation, page event handlers, request/response contracts,
dependencies, lockfile, public storefront source, or existing tests.
The original role check selects a different visual shell; it does not grant permissions
or change route access. Navigation order, labels and URLs are preserved.

Responsive improvements include the 1024px mobile drawer breakpoint, desktop icon
sidebar collapse, 375px single-column form fields, wrapping action groups, two-column
customer statistics on small screens, contained keyboard-scrollable tables, unbroken
currency/status text, and dialogs constrained to the viewport with vertical scrolling.
Sidebar and dropdown use the already installed Radix components for keyboard/focus
handling. Existing reduced-motion preferences continue to apply.

## Verification results

| Check | Result |
| --- | --- |
| API unit tests | 25 suites, 206 tests passed |
| Kernel unit tests | 1 suite, 33 tests passed |
| Console, storefront, contracts test scripts | Exit 0; no tests found in these packages |
| API integration script | Exit 0; no integration tests found |
| API isolation script | 12 tests blocked/failing in setup: database access denied for `ems_test`, Redis 6380 unavailable |
| API end-to-end script | 20 tests blocked/failing in setup for the same missing test infrastructure |
| Typechecks | Console, API, storefront, contracts, kernel passed |
| Builds | Console, API, storefront, contracts, kernel passed |
| Console startup | Production server started successfully on 3100; default 3000 already occupied |
| Root test/lint orchestration | Blocked because `pnpm` binary is unavailable; package scripts executed directly with npm |
| Console/storefront lint | Existing scripts request ESLint configuration; no configured lint run available |
| API lint | ESLint 9 reports missing `eslint.config.*` |
| Diff whitespace audit | `git diff --check` passed |
| Browser regression | 99 checks passed, zero page-level horizontal overflow or browser exceptions |

The in-app browser was unavailable. Visual checks used an isolated headless Chrome
profile with **all API traffic intercepted and fulfilled with synthetic fixtures**.
No test records or mutations reached a real API/database. Screenshots and structured
results are under `artifacts/mantis-ui/`.

The browser matrix covers all 17 routes at 1440, 1280, 768 and 375px. It verifies
drawer navigation, desktop collapse, account/logout UI, permission-controlled actions,
tenant theme isolation, empty state, modal fit/focus trapping/Escape, keyboard table
scrolling, search, status filter, pagination, publish, delete confirmation, product
create/edit (including the existing price-to-minor-units contract), validation,
customer/coupon creation, company theme settings save, and login submission.
Screenshot review also checked desktop/tablet/mobile dashboard, table, form, company
themes and drawer/dialog appearance. A final targeted dashboard check follows the
comparison-label wrapping cleanup.

Live session/authentication and database-backed CRUD regression remain unverified:
no API was available at localhost:4000, and the existing integration infrastructure
could not initialize. Fixture success is not a claim of live backend validation.
Existing customer creation rejects a blank optional phone field with an E.164 error,
even if email is populated; the successful fixture supplies a valid phone. This
pre-existing validation behavior was deliberately left unchanged.

There are **no remaining authenticated Super Admin pages** without theme coverage.
Shared login/authentication and tenant admin screens are intentionally excluded under
the strict Super Admin-only interpretation. User management, role management,
audit-log pages, uploads/exports, sorting controls and general settings are not
implemented in this console, so no demo equivalents were created or claimed tested.
