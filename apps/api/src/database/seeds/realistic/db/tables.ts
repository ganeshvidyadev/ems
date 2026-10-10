import type { TableName } from '../types';

/**
 * How each seeded table is written and how existing rows are found.
 *
 *  - `keySql` returns `(nk, id)` pairs for one tenant (`?` = tenant id) and is the single source of
 *    truth for "is this row already there". The natural key must be derivable from stable columns.
 *  - Tables whose rows carry an `owner` are inserted together with that owner and need no key query,
 *    unless other tables reference their ids (`referenced`).
 */
export interface TableDesc {
  table: string;
  /** Adds `tenant_id` to every inserted row. */
  tenantScoped: boolean;
  publicId: boolean;
  /** Which of created_at / updated_at the table has. */
  ts: 'cu' | 'c' | 'u' | 'none';
  keySql: string | null;
  /** Other rows reference this table's ids, so the id map is loaded even when nothing is inserted. */
  referenced: boolean;
}

const D = (d: Partial<TableDesc> & Pick<TableDesc, 'table'>): TableDesc => ({
  tenantScoped: true,
  publicId: false,
  ts: 'cu',
  keySql: null,
  referenced: false,
  ...d,
});

export const TABLES: Record<Exclude<TableName, 'tenants' | 'roles' | 'theme_templates'>, TableDesc> = {
  stores: D({ table: 'stores', publicId: true, keySql: 'SELECT slug AS nk, id FROM stores WHERE tenant_id = ?', referenced: true }),
  tenant_domains: D({ table: 'tenant_domains', keySql: 'SELECT hostname AS nk, id FROM tenant_domains WHERE tenant_id = ?' }),
  warehouses: D({ table: 'warehouses', publicId: true, keySql: 'SELECT code AS nk, id FROM warehouses WHERE tenant_id = ?', referenced: true }),
  users: D({ table: 'users', publicId: true, keySql: 'SELECT email_normalized AS nk, id FROM users WHERE tenant_id = ?', referenced: true }),
  user_roles: D({
    table: 'user_roles',
    tenantScoped: false,
    ts: 'none',
    keySql:
      "SELECT CONCAT(u.email_normalized, '|', r.code) AS nk, ur.id AS id FROM user_roles ur JOIN users u ON u.id = ur.user_id JOIN roles r ON r.id = ur.role_id WHERE u.tenant_id = ?",
  }),
  tax_classes: D({ table: 'tax_classes', publicId: true, ts: 'c', keySql: 'SELECT code AS nk, id FROM tax_classes WHERE tenant_id = ?', referenced: true }),
  tax_rates: D({
    table: 'tax_rates',
    publicId: true,
    ts: 'c',
    keySql:
      "SELECT CONCAT(tc.code, '|', COALESCE(tr.state_code, '*')) AS nk, tr.id AS id FROM tax_rates tr JOIN tax_classes tc ON tc.id = tr.tax_class_id WHERE tr.tenant_id = ?",
  }),
  banners: D({ table: 'banners', keySql: "SELECT CONCAT(placement, '|', sort_order) AS nk, id FROM banners WHERE tenant_id = ?" }),
  tenant_themes: D({
    table: 'tenant_themes',
    publicId: true,
    keySql: "SELECT 'published' AS nk, MIN(id) AS id FROM tenant_themes WHERE tenant_id = ? AND status = 'PUBLISHED' HAVING COUNT(*) > 0",
  }),
  brands: D({ table: 'brands', publicId: true, keySql: 'SELECT slug AS nk, id FROM brands WHERE tenant_id = ?', referenced: true }),
  categories: D({ table: 'categories', publicId: true, keySql: 'SELECT slug AS nk, id FROM categories WHERE tenant_id = ?', referenced: true }),
  product_attributes: D({ table: 'product_attributes', publicId: true, ts: 'c', keySql: 'SELECT code AS nk, id FROM product_attributes WHERE tenant_id = ?', referenced: true }),
  products: D({ table: 'products', publicId: true, keySql: 'SELECT slug AS nk, id FROM products WHERE tenant_id = ?', referenced: true }),
  product_variants: D({ table: 'product_variants', publicId: true, keySql: 'SELECT sku AS nk, id FROM product_variants WHERE tenant_id = ?', referenced: true }),
  product_media: D({
    table: 'product_media',
    ts: 'c',
    keySql: "SELECT CONCAT(p.slug, '|', pm.position) AS nk, pm.id AS id FROM product_media pm JOIN products p ON p.id = pm.product_id WHERE pm.tenant_id = ?",
  }),
  product_categories: D({
    table: 'product_categories',
    ts: 'none',
    keySql:
      "SELECT CONCAT(p.slug, '|', c.slug) AS nk, 0 AS id FROM product_categories pc JOIN products p ON p.id = pc.product_id JOIN categories c ON c.id = pc.category_id WHERE pc.tenant_id = ?",
  }),
  product_attribute_values: D({
    table: 'product_attribute_values',
    ts: 'none',
    keySql:
      "SELECT CONCAT(p.slug, '|', a.code, '|', pav.value_text) AS nk, pav.id AS id FROM product_attribute_values pav JOIN products p ON p.id = pav.product_id JOIN product_attributes a ON a.id = pav.attribute_id WHERE pav.tenant_id = ?",
  }),
  customers: D({ table: 'customers', publicId: true, keySql: 'SELECT email_normalized AS nk, id FROM customers WHERE tenant_id = ?', referenced: true }),
  customer_addresses: D({ table: 'customer_addresses', publicId: true }),
  coupons: D({ table: 'coupons', publicId: true, keySql: 'SELECT code AS nk, id FROM coupons WHERE tenant_id = ?', referenced: true }),
  gift_cards: D({ table: 'gift_cards', publicId: true, keySql: 'SELECT code_hash AS nk, id FROM gift_cards WHERE tenant_id = ?' }),
  inventory_levels: D({
    table: 'inventory_levels',
    keySql:
      "SELECT CONCAT(w.code, '|', p.slug, '|', COALESCE(v.sku, '')) AS nk, il.id AS id FROM inventory_levels il JOIN warehouses w ON w.id = il.warehouse_id JOIN products p ON p.id = il.product_id LEFT JOIN product_variants v ON v.id = il.variant_id WHERE il.tenant_id = ?",
    referenced: true,
  }),
  orders: D({ table: 'orders', publicId: true, keySql: 'SELECT order_number AS nk, id FROM orders WHERE tenant_id = ?', referenced: true }),
  order_items: D({
    table: 'order_items',
    keySql:
      "SELECT CONCAT(o.order_number, '|', oi.sku) AS nk, oi.id AS id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.tenant_id = ?",
    referenced: true,
  }),
  order_status_history: D({ table: 'order_status_history', ts: 'c' }),
  payments: D({
    table: 'payments',
    publicId: true,
    keySql:
      "SELECT CONCAT(o.order_number, '|', ROW_NUMBER() OVER (PARTITION BY p.order_id ORDER BY p.id)) AS nk, p.id AS id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.tenant_id = ?",
    referenced: true,
  }),
  refunds: D({ table: 'refunds', publicId: true }),
  shipments: D({ table: 'shipments', publicId: true, keySql: 'SELECT shipment_number AS nk, id FROM shipments WHERE tenant_id = ?', referenced: true }),
  shipment_items: D({ table: 'shipment_items', ts: 'none' }),
  shipment_events: D({ table: 'shipment_events', ts: 'c' }),
  returns: D({ table: 'returns', publicId: true, keySql: 'SELECT rma_number AS nk, id FROM returns WHERE tenant_id = ?', referenced: true }),
  return_items: D({ table: 'return_items', ts: 'none' }),
  coupon_redemptions: D({ table: 'coupon_redemptions', ts: 'none' }),
  inventory_movements: D({ table: 'inventory_movements', ts: 'c' }),
  loyalty_transactions: D({ table: 'loyalty_transactions', ts: 'c' }),
  reviews: D({ table: 'reviews', publicId: true }),
  wishlist_items: D({ table: 'wishlist_items', ts: 'none' }),
  daily_sales_rollup: D({
    table: 'daily_sales_rollup',
    ts: 'u',
    keySql: "SELECT CONCAT(DATE_FORMAT(`date`, '%Y-%m-%d'), '|', channel) AS nk, 0 AS id FROM daily_sales_rollup WHERE tenant_id = ?",
  }),
  order_sequences: D({ table: 'order_sequences', ts: 'u', keySql: "SELECT 'sequence' AS nk, 0 AS id FROM order_sequences WHERE tenant_id = ?" }),
};

/** Key queries for the two platform lookup tables. */
export const ROLE_KEY_SQL = 'SELECT code AS nk, id FROM roles WHERE tenant_id IS NULL';
export const THEME_TEMPLATE_KEY_SQL = 'SELECT code AS nk, id FROM theme_templates';

/** Tables whose id maps later tables resolve refs against, in addition to `TABLES[*].referenced`. */
export const LOOKUP_TABLES: TableName[] = ['roles', 'theme_templates'];
