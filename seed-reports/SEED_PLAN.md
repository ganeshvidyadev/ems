# EMS realistic demo data: seed plan

Status: **plan and code only. Nothing has been written to the database.** Writes need an explicit yes from the user and the `--approve-writes` flag.

- Code: `apps/api/src/database/seeds/realistic/` (new files only) and one new script, `seed:realistic`, in `apps/api/package.json`.
- Target (from the root `.env`): `host=127.0.0.1 port=3307 database=ems NODE_ENV=development` (MySQL 8.4.9).
- Reference date: `--as-of=2026-10-10`, PRNG seed `20260101` (both recorded in every report). All dates derive from the as-of date, never from the clock.
- Companion reports: `SEED_DRYRUN_<ts>.md` (per-table plan and generator self-checks), `SEED_VALIDATION_<ts>.md` (read-only DB checks), `LOGINS.md`, `baseline-existing-tenants.json` (fingerprint of the 14 untouched tenants).

## 1. What was discovered (Step 0)

Read: `PROJECT_RUN_GUIDE.md`, `docs/02-data-model.md`, `docs/storefront-themes.md`, all entity files and their registry (76 registered entities), every migration (CHECK constraints, unique and generated columns), the existing seeds (`run-seeds.ts`, `demo-tenant.seed.ts`, `seed-northwind-rich-data.ts`), and the services that own invariants: checkout pricing and tax, `OrderRepository.nextOrderNumber`, `InventoryService` (reserve / commit / release / restock), `OrderService` (cancel, fulfil, close), `ReturnService`, `OrderPaymentService`, coupon, loyalty, review, gift-card and sales-rollup services, the stub payment and carrier adapters, and `TenantGuardSubscriber`.

Facts that shaped the design:

- Money is integer minor units (paise). Tax is added on top of the line subtotal (`total = subtotal - discount + shipping + tax + cod_fee + round_off`), computed before discount, from the best `tax_rates` row for the ship-to state (state row first, then the country-wide row). The checkout adds tax even when a rate is flagged `is_inclusive`, so the seed uses exclusive rates only (see risks).
- A SIMPLE product has no variants and its stock slot has `variant_id IS NULL`; a VARIABLE product has `sku = NULL` and one slot per variant (the Northwind defect noted in the brief is not repeated; the validator checks it).
- COD orders confirm immediately (reserve then commit, `SALE`); gateway orders reserve at checkout and commit on capture; cancelling before confirmation releases, after confirmation restocks via `ADJUSTMENT` / `ORDER_CANCEL`; a return-to-origin and a resellable RMA add a `RETURN` movement. `quantity_after` is the reserved count for `RESERVATION`/`RELEASE` and the on-hand count otherwise. The ledger is generated with exactly these rules.
- `PENDING` orders have `placed_at = NULL` (it is set on confirmation); shipment and RMA numbers are `SHP-`/`RMA-` plus a base36 timestamp; order numbers are `ORD-000001...` from `order_sequences`.
- Global unique keys: `tenant_domains.hostname`, `gift_cards.code_hash`, `shipments(carrier, awb_number)`, `payments(gateway, gateway_payment_id)`. Gift-card codes, AWBs and gateway ids are therefore derived from the tenant slug.
- `TenantGuardSubscriber` only exists inside the Nest app. The seeder uses raw `mysql2` with explicit `tenant_id` on every row, so the subscriber is never involved (it would otherwise refuse inserts without a request context).
- The live database already holds 14 tenants (`northwind`, `lakeside`, 9 `bharat-*` and QA tenants, `test-company-alpha`, `apex-electronics-7741`, `lyconi-pvt-llt`). None uses the five new slugs or hostnames.

## 2. Support matrix (verified against the code and the live schema)

| Area | Status | Notes |
|---|---|---|
| Tenant, subdomain, store, warehouses (2 per tenant) | SUPPORTED | `tenants`, `tenant_domains` (`<slug>.ems.localhost`), `stores`, `warehouses` (primary + second city). |
| Staff users and roles | SUPPORTED | 6 users per tenant covering all 7 tenant roles (one user holds ORDER_MANAGER + CUSTOMER_SUPPORT). Roles are the existing system roles; none are created. |
| Brands, category tree, attributes, products, variants, media | SUPPORTED | Fictional brands; categories with materialised `path`; media are stable `placehold.co` URLs (no binaries). |
| GST classes and rates | SUPPORTED | Per-tenant slabs in use (0/5/12/18/28), HSN per product, CGST+SGST row for the home state and IGST row for everywhere else. Exclusive rates only (PARTIAL for inclusive pricing, see risks). |
| Inventory levels and movement ledger | SUPPORTED | Varied: healthy, low and a few out-of-stock products; a second warehouse for about 60% of products. |
| Customers, addresses, wishlist | SUPPORTED | 100 per tenant, 1-3 addresses each, spread over about 28 Indian cities. |
| Orders, items, history, numbering | SUPPORTED | 150 per tenant, 1-5 lines, fully reconciled totals. |
| Payments | SUPPORTED / PARTIAL | COD and the `STUB` gateway shape (`stub_order_*`, `stub_pay_*`, HMAC-style flow not stored). Real Razorpay/Stripe rows are not produced. |
| Refunds | SUPPORTED | Cancellations of prepaid orders, return-to-origin and completed returns. |
| Shipments, items, tracking events | SUPPORTED | Carrier `STUB`, AWBs `STUB<12 hex>`, events from label to delivery; failed delivery and RTO paths. |
| Returns (RMA) | SUPPORTED / PARTIAL | `RETURN` type only (exchange and replacement types exist but are not generated). 7 per tenant across REQUESTED, APPROVED, REJECTED, RECEIVED, COMPLETED. |
| Coupons ("promotions") | SUPPORTED / PARTIAL | Percentage, flat, free-shipping, min-order, total and per-customer limits, 2 expired, 1 archived. There is no separate promotions table; `BUY_X_GET_Y` needs line-mix evaluation and is not seeded. |
| Gift cards | PARTIAL | Hashed codes with active, partly used, depleted, expired and disabled states. No redemption ledger table exists, so no order is linked to a card. |
| Reviews | SUPPORTED | Verified-purchase reviews (ratings skewed to 4-5, some 1-3), moderation status, merchant replies; product rating aggregates match approved reviews. |
| Loyalty | PARTIAL | Ledger and balance cache are consistent (EARN, ADJUST, REVERSAL, REDEEM), but the checkout does not yet earn or redeem points, so none of it is tied to checkout totals. |
| Banners, storefront theme | SUPPORTED / PARTIAL | `tenants.storefront_theme` + `allowed_storefront_themes` (circuit, famms, harvest, default, default), a published `tenant_themes` row cloned from the platform template, 4 banners. `stores.active_theme_id` is left NULL like the existing demo tenants. |
| Daily sales rollup (dashboards) | SUPPORTED | Computed with the same definitions as `SalesRollupService`, so dashboards are populated without running the worker. |
| Suppliers | NOT_SUPPORTED as a table | Only a `SUPPLIER` role and marketplace `product_shares`. |
| Resellers / marketplace shares | NOT_SEEDED by rule | `product_shares` and the commission/settlement tables are cross-tenant by design (a supplier tenant and a reseller tenant). Rule 5 forbids cross-tenant references, so no marketplace rows are created. |
| Subscriptions and invoices | NOT_SEEDED | Existing demo tenants have none; the 12 console-provisioned tenants do. Billing screens will show no plan for these five. |
| CMS pages, menus, blog, notifications, support tickets, audit log, outbox | NOT_SEEDED | Out of scope for the brief; derived or event-driven tables are deliberately left to the application. |

## 3. Dataset design

Every tenant is independent: its own slug, hostname, store, warehouses, users, catalog, customers and orders. Brand names are fictional; people are invented (`+9170000xxxxx` phones, `@example.test` customer emails, `<slug>.test` staff emails); GSTINs and addresses are made up.

| Tenant | Hostname | Theme | Focus | Home state (CGST/SGST) |
|---|---|---|---|---|
| ElectroHub India | `electrohub-india.ems.localhost` | circuit | phones, laptops, audio, TVs, wearables, accessories, small appliances (GST 12/18/28) | MH (Bhiwandi), 2nd KA |
| StyleVerse Fashion | `styleverse-fashion.ems.localhost` | famms | men, women (ethnic/western), kids, footwear, accessories; size and colour variants (GST 5/12/18) | GJ (Surat), 2nd HR |
| FreshBasket Grocery | `freshbasket-grocery.ems.localhost` | harvest | staples, dairy, produce, snacks, beverages, packaged foods; pack-size variants (GST 0/5/12/18/28) | KA (Bengaluru), 2nd TS |
| SportZone India | `sportzone-india.ems.localhost` | default | cricket, badminton, football, fitness, activewear, outdoor (GST 12/18) | UP (Meerut), 2nd KA |
| DecorNest Home | `decornest-home.ems.localhost` | default | wall art, lighting, soft furnishings, vases, kitchen and dining, accents (GST 5/12/18) | RJ (Jaipur), 2nd MH |

Exact targets per tenant: **200 products, 100 customers, 150 orders** (checked on every run). Interpretation notes: "6-12 categories with subcategories" is implemented as 6-7 top-level categories each with 1-5 subcategories; products attach to the leaf. Staff: 6 users (inside the 4-6 range).

Realism parameters:

- Prices: Indian price points (ending 99/9), per-model bands, about 30% of products carry a compare-at price 10-45% above the selling price, cost price 55-85% of price, HSN and GST slab per family.
- History: the 180 days ending 2026-10-10. Day weights combine weekend lift, build-ups before Republic Day, Holi, Independence Day, Raksha Bandhan, Ganesh Chaturthi, Dussehra, Diwali and the festive big-sale windows; hour-of-day follows an IST evening peak.
- Outcome mix per tenant of 150 orders: delivered 90 (60%, of which about two thirds are closed `COMPLETED`), shipped/processing/confirmed 23 (15%), pending/failed/on hold 12 (8%), cancelled 13 (9%, prepaid ones refunded), returned/refunded 12 (8%: 5 return-to-origin, 7 customer returns). The `status` column therefore shows about 97 DELIVERED+COMPLETED, 23 in flight, 12 pending, 13 cancelled and 5 RETURNED.
- Payment mix per tenant (grocery COD/UPI-heavy, electronics card/EMI-heavy, fashion UPI/COD), COD fee Rs 30 as in the checkout, shipping flat with a per-tenant free-shipping threshold and Rs 80 express surcharge, free-shipping coupons honoured.
- Tax: CGST+SGST when the ship-to state equals the warehouse home state, IGST otherwise, with the same per-component rounding as `TaxCalculatorService`.
- Inventory: stock is replayed event by event; supplier receipts appear when a reservation would exceed stock, so nothing is ever negative. The closing position leaves about 4% of products out of stock and about 14% low.

## 4. Row counts planned (dry-run against the live database, all five tenants new)

| Table | electrohub-india | styleverse-fashion | freshbasket-grocery | sportzone-india | decornest-home |
|---|---:|---:|---:|---:|---:|
| tenants (platform table) | 1 | 1 | 1 | 1 | 1 |
| stores | 1 | 1 | 1 | 1 | 1 |
| tenant_domains | 1 | 1 | 1 | 1 | 1 |
| warehouses | 2 | 2 | 2 | 2 | 2 |
| users | 6 | 6 | 6 | 6 | 6 |
| user_roles | 7 | 7 | 7 | 7 | 7 |
| tax_classes | 3 | 3 | 5 | 2 | 3 |
| tax_rates | 6 | 6 | 10 | 4 | 6 |
| banners | 4 | 4 | 4 | 4 | 4 |
| tenant_themes | 1 | 1 | 1 | 1 | 1 |
| brands | 12 | 10 | 12 | 10 | 10 |
| categories | 21 | 18 | 25 | 17 | 19 |
| product_attributes | 20 | 12 | 9 | 12 | 11 |
| products | 200 | 200 | 200 | 200 | 200 |
| product_variants | 317 | 691 | 182 | 237 | 165 |
| product_media | 613 | 610 | 594 | 605 | 618 |
| product_categories | 200 | 200 | 200 | 200 | 200 |
| product_attribute_values | 599 | 1250 | 352 | 549 | 416 |
| customers | 100 | 100 | 100 | 100 | 100 |
| customer_addresses | 183 | 176 | 177 | 175 | 155 |
| coupons | 9 | 9 | 9 | 9 | 9 |
| gift_cards | 8 | 8 | 8 | 8 | 8 |
| inventory_levels | 649 | 1125 | 485 | 576 | 457 |
| orders | 150 | 150 | 150 | 150 | 150 |
| order_items | 241 | 294 | 468 | 258 | 259 |
| order_status_history | 719 | 740 | 758 | 741 | 731 |
| payments | 150 | 150 | 150 | 150 | 150 |
| shipments | 115 | 115 | 116 | 116 | 114 |
| shipment_items | 185 | 215 | 355 | 208 | 198 |
| shipment_events | 667 | 668 | 662 | 661 | 662 |
| returns | 7 | 7 | 7 | 7 | 7 |
| return_items | 7 | 7 | 7 | 7 | 7 |
| refunds | 11 | 11 | 10 | 11 | 12 |
| coupon_redemptions | 44 | 37 | 36 | 41 | 37 |
| inventory_movements | 1238 | 1928 | 1528 | 1224 | 1058 |
| loyalty_transactions | 171 | 151 | 157 | 150 | 144 |
| reviews | 46 | 63 | 109 | 55 | 50 |
| wishlist_items | 197 | 164 | 164 | 179 | 213 |
| daily_sales_rollup | 198 | 174 | 172 | 162 | 176 |
| order_sequences | 1 | 1 | 1 | 1 | 1 |
| **total rows to insert** | **7110** | **9316** | **7241** | **6848** | **6369** |

About 36,900 rows in total. Estimated duration 11-34 seconds for everything (batched multi-row inserts, one transaction per entity group, two bcrypt hashes).

## 5. Determinism, idempotency, isolation

- Every random choice comes from mulberry32 keyed by `(seed, tenant slug, entity kind, index)`; public ids are deterministic ULID-shaped values (creation time plus a SHA-256 of the natural key). The dry-run rebuilds each tenant twice and compares digests.
- Natural keys: tenant slug, hostname, user email, store slug, warehouse code, SKU/slug, variant SKU, customer email, coupon code, gift-card hash, order number, shipment number, RMA number, `(warehouse, product, variant)` slots. Existing rows are never updated. Child rows of an order, customer or stock slot are inserted only when their owner is missing, so a rerun reports `0 inserted, N already present`.
- Writes are additive: only `INSERT`, plus three narrowly allow-listed `UPDATE`s on rows created in the same transaction (category `path` placeholder, and the new tenant's `owner_user_id`). The writer refuses any other statement text.
- Every row carries the tenant's own `tenant_id`; references are symbolic and resolved only within the tenant (plus the global role and theme-template lookups). Cross-tenant uniqueness of global keys is checked before any write.

## 6. Checks

Before the database is touched (every dry-run): natural keys unique; all references resolve within the tenant; exact 200/100/150; SIMPLE/VARIABLE slot rules; compare-at and cost ratios; order totals, item sums, tax breakups, stock allocations; payments and refunds reconcile; ledger replays to levels (never negative, reserved <= on-hand); coupon usage and limits; sold counts, ratings and loyalty balances; no future timestamps; table CHECK constraints; writer ordering; idempotency simulation; determinism; global uniqueness.

Against the live schema (read-only session): all 40 tables exist, every written column exists and is writable, NOT NULL columns are covered, text fits, every `CHECK (col IN (...))` value is allowed, migrations are applied, system roles exist.

`--validate` (read-only): counts, tenant FK consistency and orphans for 47 parent/child links, unique keys, inventory invariants, purchasable slots, order and payment reconciliation, stock-ledger reconciliation, coupon limits, date window, storefront readiness, rating aggregates, plus a count-and-checksum comparison of the 14 existing tenants against `baseline-existing-tenants.json`, plus a second-run plan that must insert nothing.

Not built yet (needs your approval to run because it writes): a smoke test that places one COD order per tenant through the live storefront API and cancels it.

## 7. Risks and open points

1. **One pending migration blocks the write.** `WebsiteContent1789800000000` (platform `website_content` table) is not applied to `ems`. It does not touch any seeded table; either run `migration:run` (your call) or approve `--allow-pending-migrations`. `run-seeds.ts` refuses pending migrations for the same reason.
2. **GST-inclusive pricing is not modelled.** The checkout adds tax on top regardless of `is_inclusive`; the seed uses exclusive rates and shows prices ex-GST so stored totals match what the application would compute. If inclusive pricing is fixed later, re-seed under a new `--seed`.
3. **Free shipping and COD.** The checkout never waives shipping by threshold; the seed applies a per-tenant threshold (and free-shipping coupons) as a merchant policy, so these orders' shipping differs from what a fresh checkout quotes today.
4. **Images are external placeholders** (`placehold.co`), so product pages need internet access; they are plain `<img>` tags in the storefront, not `next/image`.
5. **Passwords.** Staff use the shared demo password and customers the customer demo password from `PROJECT_RUN_GUIDE.md` (overridable via `SEED_STAFF_PASSWORD` / `SEED_CUSTOMER_PASSWORD`); only bcrypt hashes are written, nothing is printed.
6. **No rollback by delete.** The seeder never deletes. If you want the data gone, that is a deliberate, separate decision (the five tenants are self-contained and identified by slug). The QA suite (`node --test qa/api/03-tenant-isolation.test.mjs`) re-verifies isolation after the write.
7. **Existing data quality.** The read-only validator shows the older seeded/QA tenants still have variant-bound stock on SIMPLE products (the defect described in the brief). They are untouched, as required.
8. **Loyalty and gift-card ledgers** are consistent within themselves but have no checkout integration yet, so a customer who logs in will see the points but not be able to spend them at checkout.
9. **Two database engines are installed.** `127.0.0.1:3306` is XAMPP MariaDB (not used); the seeder only reads `.env`, which points at MySQL 8.4 on 3307. MySQL 8.4 was not running when this started, so it was started with the documented command (low-memory flags) and left running.

## 8. How to run (from `apps/api`; `pnpm` is blocked here, so call node directly)

```
node ../../node_modules/ts-node/dist/bin.js -r tsconfig-paths/register src/database/seeds/realistic/seed-realistic.ts --dry-run
node ../../node_modules/ts-node/dist/bin.js -r tsconfig-paths/register src/database/seeds/realistic/seed-realistic.ts --validate
node ../../node_modules/ts-node/dist/bin.js -r tsconfig-paths/register src/database/seeds/realistic/seed-realistic.ts --tenant=electrohub-india --approve-writes   # after your yes
```

After approval the order is: one tenant first, `--validate`, the remaining four, a second run to prove `0 inserted`, `--validate` again, then the isolation suite.
