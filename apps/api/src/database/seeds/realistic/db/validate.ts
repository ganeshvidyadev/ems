import { TARGETS } from '../catalogs';
import { type Conn, q } from './connection';

export interface DbCheck {
  scope: string;
  name: string;
  ok: boolean;
  detail: string;
  /** True when the check was not applicable yet (tenant not seeded): neither a pass nor a failure. */
  skipped?: boolean;
}

type Row = Record<string, unknown>;

async function scalar(conn: Conn, sql: string, params: unknown[] = []): Promise<number> {
  const rows = await q<Row>(conn, sql, params);
  const first = rows[0] ? Object.values(rows[0])[0] : 0;
  return Number(first ?? 0);
}

/** Parent/child pairs whose tenant ids must agree and whose references must resolve. */
const FK_PAIRS: { child: string; col: string; parent: string; childHasTenant?: boolean }[] = [
  { child: 'products', col: 'store_id', parent: 'stores' },
  { child: 'products', col: 'brand_id', parent: 'brands' },
  { child: 'products', col: 'tax_class_id', parent: 'tax_classes' },
  { child: 'product_variants', col: 'product_id', parent: 'products' },
  { child: 'product_media', col: 'product_id', parent: 'products' },
  { child: 'product_categories', col: 'product_id', parent: 'products' },
  { child: 'product_categories', col: 'category_id', parent: 'categories' },
  { child: 'product_attribute_values', col: 'product_id', parent: 'products' },
  { child: 'product_attribute_values', col: 'attribute_id', parent: 'product_attributes' },
  { child: 'categories', col: 'parent_id', parent: 'categories' },
  { child: 'warehouses', col: 'store_id', parent: 'stores' },
  { child: 'inventory_levels', col: 'warehouse_id', parent: 'warehouses' },
  { child: 'inventory_levels', col: 'product_id', parent: 'products' },
  { child: 'inventory_levels', col: 'variant_id', parent: 'product_variants' },
  { child: 'inventory_movements', col: 'warehouse_id', parent: 'warehouses' },
  { child: 'inventory_movements', col: 'product_id', parent: 'products' },
  { child: 'customers', col: 'store_id', parent: 'stores' },
  { child: 'customer_addresses', col: 'customer_id', parent: 'customers' },
  { child: 'wishlist_items', col: 'customer_id', parent: 'customers' },
  { child: 'wishlist_items', col: 'product_id', parent: 'products' },
  { child: 'orders', col: 'store_id', parent: 'stores' },
  { child: 'orders', col: 'customer_id', parent: 'customers' },
  { child: 'orders', col: 'coupon_id', parent: 'coupons' },
  { child: 'order_items', col: 'order_id', parent: 'orders' },
  { child: 'order_items', col: 'product_id', parent: 'products' },
  { child: 'order_items', col: 'variant_id', parent: 'product_variants' },
  { child: 'order_items', col: 'warehouse_id', parent: 'warehouses' },
  { child: 'order_status_history', col: 'order_id', parent: 'orders' },
  { child: 'payments', col: 'order_id', parent: 'orders' },
  { child: 'refunds', col: 'payment_id', parent: 'payments' },
  { child: 'refunds', col: 'order_id', parent: 'orders' },
  { child: 'shipments', col: 'order_id', parent: 'orders' },
  { child: 'shipments', col: 'warehouse_id', parent: 'warehouses' },
  { child: 'shipment_items', col: 'shipment_id', parent: 'shipments' },
  { child: 'shipment_items', col: 'order_item_id', parent: 'order_items' },
  { child: 'shipment_events', col: 'shipment_id', parent: 'shipments' },
  { child: 'returns', col: 'order_id', parent: 'orders' },
  { child: 'return_items', col: 'return_id', parent: 'returns' },
  { child: 'return_items', col: 'order_item_id', parent: 'order_items' },
  { child: 'coupon_redemptions', col: 'coupon_id', parent: 'coupons' },
  { child: 'coupon_redemptions', col: 'order_id', parent: 'orders' },
  { child: 'loyalty_transactions', col: 'customer_id', parent: 'customers' },
  { child: 'reviews', col: 'product_id', parent: 'products' },
  { child: 'reviews', col: 'customer_id', parent: 'customers' },
  { child: 'reviews', col: 'order_item_id', parent: 'order_items' },
  { child: 'gift_cards', col: 'issued_to_customer_id', parent: 'customers' },
];

export interface ValidateOptions {
  slug: string;
  asOfEnd: Date;
  historyStart: Date;
  /** After a write the tenant must exist; before one, a missing tenant is simply reported as not seeded. */
  requireSeeded: boolean;
}

/** Read-only checks for one seeded tenant. Every query is scoped to the tenant by `tenant_id`. */
export async function validateTenant(conn: Conn, opts: ValidateOptions): Promise<DbCheck[]> {
  const { slug } = opts;
  const out: DbCheck[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    out.push({ scope: slug, name, ok, detail });
  };
  const tenant = (await q<{ id: string; status: string; storefront_theme: string }>(conn, 'SELECT id, status, storefront_theme FROM tenants WHERE slug = ?', [slug]))[0];
  if (!tenant) {
    out.push({ scope: slug, name: 'tenant is seeded', ok: !opts.requireSeeded, skipped: !opts.requireSeeded, detail: opts.requireSeeded ? 'tenant row not found' : 'not seeded yet: tenant checks skipped' });
    return out;
  }
  const t = tenant.id;

  // Counts.
  const products = await scalar(conn, 'SELECT COUNT(*) FROM products WHERE tenant_id = ? AND deleted_at IS NULL', [t]);
  const customers = await scalar(conn, 'SELECT COUNT(*) FROM customers WHERE tenant_id = ? AND deleted_at IS NULL', [t]);
  const orders = await scalar(conn, 'SELECT COUNT(*) FROM orders WHERE tenant_id = ?', [t]);
  add('product count = 200', products === TARGETS.products, `${products}`);
  add('customer count = 100', customers === TARGETS.customers, `${customers}`);
  add('order count = 150', orders === TARGETS.orders, `${orders}`);

  // Tenant FK consistency and orphans.
  const mismatches: string[] = [];
  const orphans: string[] = [];
  for (const pair of FK_PAIRS) {
    const sameTenant = await scalar(
      conn,
      `SELECT COUNT(*) FROM \`${pair.child}\` c JOIN \`${pair.parent}\` p ON p.id = c.\`${pair.col}\` WHERE c.tenant_id = ? AND p.tenant_id <> c.tenant_id`,
      [t],
    );
    if (sameTenant > 0) mismatches.push(`${pair.child}.${pair.col}->${pair.parent}: ${sameTenant}`);
    const orphan = await scalar(
      conn,
      `SELECT COUNT(*) FROM \`${pair.child}\` c LEFT JOIN \`${pair.parent}\` p ON p.id = c.\`${pair.col}\` WHERE c.tenant_id = ? AND c.\`${pair.col}\` IS NOT NULL AND p.id IS NULL`,
      [t],
    );
    if (orphan > 0) orphans.push(`${pair.child}.${pair.col}: ${orphan}`);
  }
  add('tenant FK consistency (every child and its parent share tenant_id)', mismatches.length === 0, mismatches.join('; ') || 'ok');
  add('no orphaned references', orphans.length === 0, orphans.join('; ') || 'ok');

  // Unique keys (database enforces them; this is a belt-and-braces count).
  const dupSku = await scalar(conn, 'SELECT COUNT(*) FROM (SELECT sku FROM products WHERE tenant_id = ? AND sku IS NOT NULL AND deleted_at IS NULL GROUP BY sku HAVING COUNT(*) > 1) d', [t]);
  const dupOrder = await scalar(conn, 'SELECT COUNT(*) FROM (SELECT order_number FROM orders WHERE tenant_id = ? GROUP BY order_number HAVING COUNT(*) > 1) d', [t]);
  const dupVariant = await scalar(conn, 'SELECT COUNT(*) FROM (SELECT sku FROM product_variants WHERE tenant_id = ? GROUP BY sku HAVING COUNT(*) > 1) d', [t]);
  add('unique keys: product sku, variant sku, order number', dupSku + dupOrder + dupVariant === 0, `dupSku=${dupSku} dupVariant=${dupVariant} dupOrder=${dupOrder}`);

  // Inventory invariants.
  const badLevels = await scalar(conn, 'SELECT COUNT(*) FROM inventory_levels WHERE tenant_id = ? AND (quantity_on_hand < 0 OR quantity_reserved < 0 OR quantity_reserved > quantity_on_hand OR quantity_available < 0)', [t]);
  add('inventory: on_hand >= 0, 0 <= reserved <= on_hand, available >= 0', badLevels === 0, `${badLevels} bad level(s)`);
  const noSlot = await scalar(
    conn,
    `SELECT COUNT(*) FROM products p WHERE p.tenant_id = ? AND p.status = 'ACTIVE' AND p.type = 'SIMPLE' AND p.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM inventory_levels il WHERE il.product_id = p.id AND il.variant_id IS NULL)`,
    [t],
  );
  const variantSlotOnSimple = await scalar(
    conn,
    `SELECT COUNT(*) FROM inventory_levels il JOIN products p ON p.id = il.product_id WHERE il.tenant_id = ? AND p.type = 'SIMPLE' AND il.variant_id IS NOT NULL`,
    [t],
  );
  const variableWithVariantless = await scalar(
    conn,
    `SELECT COUNT(*) FROM inventory_levels il JOIN products p ON p.id = il.product_id WHERE il.tenant_id = ? AND p.type = 'VARIABLE' AND il.variant_id IS NULL`,
    [t],
  );
  add('every ACTIVE SIMPLE product has a purchasable variant_id IS NULL slot (and VARIABLE ones never do)', noSlot + variantSlotOnSimple + variableWithVariantless === 0, `noSlot=${noSlot} variantSlotOnSimple=${variantSlotOnSimple} variableWithVariantless=${variableWithVariantless}`);
  const variantNoSlot = await scalar(
    conn,
    `SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.tenant_id = ? AND p.status = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM inventory_levels il WHERE il.variant_id = v.id)`,
    [t],
  );
  add('every variant of an ACTIVE product has a stock slot', variantNoSlot === 0, `${variantNoSlot} without`);

  // Order arithmetic.
  const badTotals = await scalar(conn, 'SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND total_minor <> subtotal_minor - discount_minor + shipping_minor + tax_minor + cod_fee_minor + round_off_minor', [t]);
  const itemMismatch = await scalar(
    conn,
    `SELECT COUNT(*) FROM orders o JOIN (SELECT order_id, SUM(line_subtotal_minor) s, SUM(line_discount_minor) d, SUM(line_tax_minor) x, SUM(line_total_minor) t FROM order_items WHERE tenant_id = ? GROUP BY order_id) i ON i.order_id = o.id
      WHERE o.tenant_id = ? AND (i.s <> o.subtotal_minor OR i.d <> o.discount_minor OR i.x <> o.tax_minor)`,
    [t, t],
  );
  const lineBad = await scalar(conn, 'SELECT COUNT(*) FROM order_items WHERE tenant_id = ? AND (line_total_minor <> line_subtotal_minor - line_discount_minor + line_tax_minor OR unit_price_minor * quantity <> line_subtotal_minor)', [t]);
  add('order totals reconcile: total = subtotal - discount + shipping + tax + COD fee + round-off; items sum to the order', badTotals + itemMismatch + lineBad === 0, `badTotals=${badTotals} itemMismatch=${itemMismatch} lineBad=${lineBad}`);
  const noItems = await scalar(conn, 'SELECT COUNT(*) FROM orders o WHERE o.tenant_id = ? AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)', [t]);
  add('every order has 1-5 line items', noItems === 0 && (await scalar(conn, 'SELECT COUNT(*) FROM (SELECT order_id FROM order_items WHERE tenant_id = ? GROUP BY order_id HAVING COUNT(*) > 5) d', [t])) === 0, `${noItems} orders without items`);

  // Payments and refunds.
  const payBad = await scalar(
    conn,
    `SELECT COUNT(*) FROM orders o LEFT JOIN (SELECT order_id, SUM(amount_captured_minor) c, SUM(amount_refunded_minor) r FROM payments WHERE tenant_id = ? GROUP BY order_id) p ON p.order_id = o.id
      WHERE o.tenant_id = ? AND (COALESCE(p.c, 0) <> o.amount_paid_minor OR COALESCE(p.r, 0) <> o.amount_refunded_minor OR o.amount_refunded_minor > o.amount_paid_minor)`,
    [t, t],
  );
  add('payments reconcile with orders (captured = paid, refunded = refunded <= paid)', payBad === 0, `${payBad} mismatched order(s)`);
  const refundBad = await scalar(
    conn,
    `SELECT COUNT(*) FROM payments p LEFT JOIN (SELECT payment_id, SUM(amount_minor) a FROM refunds WHERE tenant_id = ? AND status = 'COMPLETED' GROUP BY payment_id) r ON r.payment_id = p.id WHERE p.tenant_id = ? AND COALESCE(r.a, 0) <> p.amount_refunded_minor`,
    [t, t],
  );
  add('refund rows add up to payment.amount_refunded_minor', refundBad === 0, `${refundBad} mismatched`);

  // Stock ledger replay.
  const ledgerBad = await scalar(
    conn,
    `SELECT COUNT(*) FROM inventory_levels il
       LEFT JOIN (
         SELECT warehouse_id, product_id, IFNULL(variant_id, 0) AS vid,
                SUM(CASE WHEN type NOT IN ('RESERVATION', 'RELEASE') THEN quantity_delta ELSE 0 END) AS oh,
                SUM(CASE WHEN type IN ('RESERVATION', 'RELEASE') OR (type = 'SALE' AND reference_type = 'ORDER') THEN quantity_delta ELSE 0 END) AS rs
           FROM inventory_movements WHERE tenant_id = ? GROUP BY warehouse_id, product_id, IFNULL(variant_id, 0)
       ) m ON m.warehouse_id = il.warehouse_id AND m.product_id = il.product_id AND m.vid = IFNULL(il.variant_id, 0)
      WHERE il.tenant_id = ? AND (COALESCE(m.oh, 0) <> il.quantity_on_hand OR COALESCE(m.rs, 0) <> il.quantity_reserved)`,
    [t, t],
  );
  add('stock movements reconcile with on_hand and reserved for every slot', ledgerBad === 0, `${ledgerBad} slot(s) differ from their ledger`);

  // Coupons.
  const couponBad = await scalar(
    conn,
    `SELECT COUNT(*) FROM coupons c LEFT JOIN (SELECT coupon_id, COUNT(*) n FROM coupon_redemptions WHERE tenant_id = ? GROUP BY coupon_id) r ON r.coupon_id = c.id
      WHERE c.tenant_id = ? AND (c.usage_count <> COALESCE(r.n, 0) OR (c.usage_limit_total IS NOT NULL AND c.usage_count > c.usage_limit_total))`,
    [t, t],
  );
  const perCustomerBad = await scalar(
    conn,
    `SELECT COUNT(*) FROM (SELECT cr.coupon_id, cr.customer_id, COUNT(*) n FROM coupon_redemptions cr WHERE cr.tenant_id = ? GROUP BY cr.coupon_id, cr.customer_id) x
       JOIN coupons c ON c.id = x.coupon_id WHERE c.usage_limit_per_customer IS NOT NULL AND x.n > c.usage_limit_per_customer`,
    [t],
  );
  add('coupon usage_count = redemptions, within total and per-customer limits', couponBad + perCustomerBad === 0, `couponBad=${couponBad} perCustomerBad=${perCustomerBad}`);

  // Dates.
  const future = await scalar(conn, 'SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND created_at > ?', [t, opts.asOfEnd]);
  const tooOld = await scalar(conn, 'SELECT COUNT(*) FROM orders WHERE tenant_id = ? AND created_at < ?', [t, opts.historyStart]);
  add('order dates within the 6-month window ending at the as-of date', future + tooOld === 0, `future=${future} tooOld=${tooOld}`);

  // Storefront readiness.
  const store = await q<Row>(conn, "SELECT id, status FROM stores WHERE tenant_id = ?", [t]);
  const domain = await scalar(conn, "SELECT COUNT(*) FROM tenant_domains WHERE tenant_id = ? AND is_primary = 1 AND verified_at IS NOT NULL", [t]);
  const warehouses = await scalar(conn, 'SELECT COUNT(*) FROM warehouses WHERE tenant_id = ? AND is_active = 1', [t]);
  const theme = await scalar(conn, "SELECT COUNT(*) FROM tenant_themes WHERE tenant_id = ? AND status = 'PUBLISHED'", [t]);
  add(
    'storefront readiness: ACTIVE tenant, ACTIVE store, verified primary domain, warehouse, theme assignment',
    tenant.status === 'ACTIVE' && store.length >= 1 && String(store[0]!['status']) === 'ACTIVE' && domain >= 1 && warehouses >= 1 && tenant.storefront_theme.length > 0,
    `tenant=${tenant.status} store=${store.length ? String(store[0]!['status']) : 'none'} domain=${domain} warehouses=${warehouses} publishedTheme=${theme} theme=${tenant.storefront_theme}`,
  );
  const usersWithRoles = await scalar(conn, 'SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE u.tenant_id = ?', [t]);
  add('staff users have role grants', usersWithRoles >= 4, `${usersWithRoles} users with roles`);
  const ratingBad = await scalar(
    conn,
    `SELECT COUNT(*) FROM products p LEFT JOIN (SELECT product_id, COUNT(*) n, AVG(rating) a FROM reviews WHERE tenant_id = ? AND status = 'APPROVED' GROUP BY product_id) r ON r.product_id = p.id
      WHERE p.tenant_id = ? AND (p.rating_count <> COALESCE(r.n, 0) OR ABS(p.rating_average - COALESCE(r.a, 0)) > 0.006)`,
    [t, t],
  );
  add('product rating_count / rating_average match approved reviews', ratingBad === 0, `${ratingBad} mismatched`);
  return out;
}

// ---------------------------------------------------------------------------
// Existing-tenant protection: counts + checksums
// ---------------------------------------------------------------------------

export interface TableFingerprint {
  rows: number;
  checksum: string;
}

export type TenantFingerprint = Record<string, TableFingerprint>;

const FINGERPRINT_COLUMNS: Record<string, string> = {
  products: "CONCAT_WS('|', id, public_id, sku, slug, status, price_minor, version, updated_at)",
  product_variants: "CONCAT_WS('|', id, sku, price_minor, updated_at)",
  categories: "CONCAT_WS('|', id, slug, parent_id, product_count, updated_at)",
  brands: "CONCAT_WS('|', id, slug, updated_at)",
  customers: "CONCAT_WS('|', id, email_normalized, status, total_orders, updated_at)",
  customer_addresses: "CONCAT_WS('|', id, customer_id, postal_code, updated_at)",
  orders: "CONCAT_WS('|', id, order_number, status, payment_status, total_minor, version, updated_at)",
  order_items: "CONCAT_WS('|', id, order_id, sku, quantity, line_total_minor)",
  inventory_levels: "CONCAT_WS('|', id, warehouse_id, product_id, variant_id, quantity_on_hand, quantity_reserved, version)",
  inventory_movements: "CONCAT_WS('|', id, type, quantity_delta, quantity_after)",
  payments: "CONCAT_WS('|', id, status, amount_minor, amount_captured_minor, amount_refunded_minor)",
  coupons: "CONCAT_WS('|', id, code, usage_count, status)",
  stores: "CONCAT_WS('|', id, slug, status, name)",
  warehouses: "CONCAT_WS('|', id, code, is_default)",
  users: "CONCAT_WS('|', id, email_normalized, status)",
  reviews: "CONCAT_WS('|', id, product_id, rating, status)",
};

/** Row counts and a CRC32-sum checksum of each key table for one tenant (read-only). */
export async function fingerprintTenant(conn: Conn, tenantId: string): Promise<TenantFingerprint> {
  const out: TenantFingerprint = {};
  for (const [table, expr] of Object.entries(FINGERPRINT_COLUMNS)) {
    const rows = await q<{ n: string; c: string | null }>(conn, `SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(${expr})), 0) AS c FROM \`${table}\` WHERE tenant_id = ?`, [tenantId]);
    out[table] = { rows: Number(rows[0]?.n ?? 0), checksum: String(rows[0]?.c ?? '0') };
  }
  return out;
}

export async function countPlatformRows(conn: Conn): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ['tenants', 'users', 'roles', 'permissions', 'plans', 'theme_templates']) out[table] = await scalar(conn, `SELECT COUNT(*) FROM \`${table}\``);
  return out;
}
