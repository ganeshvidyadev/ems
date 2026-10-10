/**
 * Shared types for the realistic-data seeder.
 *
 * The seeder is split in two on purpose: pure, deterministic *generators* that build an
 * in-memory dataset (rows addressed by natural keys and symbolic `Ref`s, never database ids),
 * and a thin *writer* that resolves refs to ids and inserts only what is missing. Generators
 * never touch the database, so dry-runs, tests and re-runs are cheap and exact.
 */

/** Every table the seeder can produce rows for, in foreign-key dependency order. */
export const TABLE_ORDER = [
  'stores',
  'tenant_domains',
  'warehouses',
  'users',
  'user_roles',
  'tax_classes',
  'tax_rates',
  'banners',
  'tenant_themes',
  'brands',
  'categories',
  'product_attributes',
  'products',
  'product_variants',
  'product_media',
  'product_categories',
  'product_attribute_values',
  'customers',
  'customer_addresses',
  'coupons',
  'gift_cards',
  'inventory_levels',
  'orders',
  'order_items',
  'order_status_history',
  'payments',
  'shipments',
  'shipment_items',
  'shipment_events',
  'returns',
  'return_items',
  'refunds',
  'coupon_redemptions',
  'inventory_movements',
  'loyalty_transactions',
  'reviews',
  'wishlist_items',
  'daily_sales_rollup',
  'order_sequences',
] as const;

export type TableName = (typeof TABLE_ORDER)[number] | 'tenants' | 'roles' | 'theme_templates';

/** A symbolic foreign key: "the row of `table` whose natural key is `nk`". Resolved by the writer. */
export class Ref {
  constructor(
    readonly table: TableName,
    readonly nk: string,
  ) {}
}

export type Scalar = string | number | boolean | null | Date;
/** Objects/arrays are JSON columns; `Ref` is a foreign key; `Date` is a UTC datetime. */
export type Val = Scalar | Ref | Record<string, unknown> | readonly unknown[];

export interface Row {
  /** Natural key, stable across runs. Unique within its table and tenant. */
  nk: string;
  /** Creation timestamp; also seeds the deterministic public id and created_at/updated_at. */
  ts: Date;
  /** Optional separate `updated_at` (defaults to `ts`). */
  updatedAt?: Date;
  /** Column values (snake_case DB columns). `tenant_id`, `public_id` and timestamps are added by the writer. */
  v: Record<string, Val>;
  /**
   * When set, the row is a child that is inserted if, and only if, its owner is not already in
   * the database. This is how all-or-nothing order graphs stay idempotent without per-row keys.
   */
  owner?: Ref;
  /** When true, the row is silently skipped if one of its refs cannot be resolved (e.g. a missing theme template). */
  optional?: boolean;
}

export type TableRows = Partial<Record<TableName, Row[]>>;

export interface DatasetOptions {
  /** Global PRNG seed. */
  seed: number;
  /** Fixed "today" (YYYY-MM-DD, UTC). All relative dates derive from this, never from the clock. */
  asOf: string;
  rootDomain: string;
}

export interface TenantSummary {
  slug: string;
  products: number;
  variants: number;
  customers: number;
  orders: number;
  statusCounts: Record<string, number>;
  paymentMethodCounts: Record<string, number>;
  gstSlabCounts: Record<string, number>;
  inventoryArchetypes: Record<string, number>;
  revenueMinor: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export interface TenantDataset {
  slug: string;
  businessName: string;
  hostname: string;
  /** Row for the `tenants` table (global). */
  tenant: Row;
  rows: TableRows;
  summary: TenantSummary;
  /** Users with their roles, for LOGINS.md (never passwords). */
  logins: { email: string; name: string; roles: string[] }[];
  giftCardCodes: { code: string; initialMinor: string; status: string }[];
  couponCodes: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Catalog (tenant specification) types
// ---------------------------------------------------------------------------

export interface BrandSpec {
  slug: string;
  name: string;
  description: string;
}

export interface CategorySpec {
  slug: string;
  name: string;
  description: string;
  /** Subcategories (one level). Products attach to the leaf. */
  children?: { slug: string; name: string; description: string }[];
}

export interface VariantAxisValue {
  label: string;
  code: string;
  /** Added to the base price, in rupees (can be 0). */
  priceDelta?: number;
  /** Multiplies the base price (pack sizes); applied before `priceDelta`. Defaults to 1. */
  priceMult?: number;
  /** Weight delta in grams. */
  weightDelta?: number;
}

export interface VariantAxis {
  name: string;
  values: VariantAxisValue[];
}

export interface FamilySpec {
  /** Short code used in SKUs, e.g. `SMP`. */
  id: string;
  /** Leaf category slug (must exist in the tenant's category tree). */
  category: string;
  /** Optional second category the product is also listed in. */
  alsoIn?: string;
  count: number;
  type: 'SIMPLE' | 'VARIABLE';
  /** Brand slugs that make this kind of product. */
  brands: string[];
  /** Model / style words; product name is `${brand} ${model}`. brands x models must be >= count. */
  models: string[];
  gst: 0 | 5 | 12 | 18 | 28;
  hsn: string;
  /** Selling price range in whole rupees. */
  price: [number, number];
  /** Price ending style: 99 -> ...99, 9 -> ...9, 0 -> round tens, 5 -> multiples of 5, 1 -> exact rupee. */
  ending: 99 | 9 | 0 | 5 | 1;
  weightG: [number, number];
  dimsMm?: [number, number, number];
  /** Variant axes (VARIABLE only); the cross product is sampled down to at most `maxVariants`. */
  axes?: VariantAxis[];
  maxVariants?: number;
  /** Display specs: spec name -> candidate values (one picked per product). */
  specs: Record<string, string[]>;
  /** Specs that are also faceted (stored in product_attribute_values). */
  facets: string[];
  blurb: string;
  bullets: string[];
  /** Typical opening stock range for one slot. */
  stock: [number, number];
  /** Baseline popularity weight (relative). */
  popularity: number;
  /** Colour pair (bg, fg hex without #) for placeholder imagery. */
  palette: [string, string];
}

export interface CouponSpec {
  code: string;
  name: string;
  description: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  /** Percent for PERCENTAGE; rupees for FIXED_AMOUNT. */
  value: number;
  maxDiscountRupees?: number;
  minOrderRupees?: number;
  usageLimitTotal?: number;
  usageLimitPerCustomer?: number;
  /** Days before as-of that the coupon starts / ends (ends may be negative = still running). */
  startDaysAgo: number;
  endDaysAgo?: number;
  /** Relative likelihood of use among eligible orders. */
  weight: number;
  status?: 'ACTIVE' | 'ARCHIVED';
}

export interface WarehouseSpec {
  code: string;
  name: string;
  line1: string;
  city: string;
  state: string;
  stateCode: string;
  postal: string;
  lat: string;
  lng: string;
}

export interface TenantSpec {
  slug: string;
  tag: string;
  businessName: string;
  legalName: string;
  gstin: string;
  /** Storefront theme code (see `STOREFRONT_THEMES` in theme-access.service). */
  storefrontTheme: 'default' | 'organic' | 'famms' | 'circuit' | 'harvest';
  /** `theme_templates.code` to clone into a published `tenant_themes` row (skipped if absent). */
  themeTemplate: string;
  brandColor: string;
  accentColor: string;
  tagline: string;
  storeName: string;
  contactPhone: string;
  supportPhone: string;
  brands: BrandSpec[];
  categories: CategorySpec[];
  families: FamilySpec[];
  warehouses: WarehouseSpec[];
  coupons: CouponSpec[];
  banners: { title: string; subtitle: string; cta: string; link: string }[];
  /** Payment method weights for online/COD mix. */
  paymentMix: [method: 'COD' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'EMI', weight: number][];
  /** Lines per order: [lines, weight]. */
  lineMix: [number, number][];
  /** Quantity per line: [qty, weight]. */
  qtyMix: [number, number][];
  freeShippingRupees: number;
  shippingRupees: number;
  /** Share of customers that live in the warehouse's home state (drives CGST/SGST vs IGST). */
  homeStateShare: number;
  /** Weekend multiplier for order volume. */
  weekendBoost: number;
  /** Owner / staff first names (fictional). */
  staff: { key: string; first: string; last: string; roles: string[] }[];
  /** Review phrasing nouns by category slug fall back to this. */
  reviewNoun: string;
}
