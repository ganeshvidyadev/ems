import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Restore missing supplier deductions from immutable sale evidence, never reprice a sale. */
export class SupplierOrderReconciliation1791626400002 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const orders: { id: string; tenant_id: string; parent_order_id: string; total_minor: string; subtotal_minor: string }[] =
      await runner.query(`SELECT id, tenant_id, parent_order_id, total_minor, subtotal_minor FROM orders
        WHERE is_marketplace_order = 1 AND parent_order_id IS NOT NULL
          AND discount_minor = 0 AND shipping_minor = 0 AND tax_minor = 0
          AND cod_fee_minor = 0 AND round_off_minor = 0 AND subtotal_minor <> total_minor`);

    for (const order of orders) {
      const lines: { id: string; line_subtotal_minor: string; net_minor: string; commission_minor: string; platform_fee_minor: string }[] =
        await runner.query(`
          SELECT child.id, child.line_subtotal_minor, sale.net_minor,
                 parent.commission_minor,
                 (SELECT COALESCE(SUM(fee.net_minor), 0) FROM commission_ledger fee
                   WHERE fee.order_item_id = parent.id AND fee.order_id = parent.order_id
                     AND fee.entry_type = 'PLATFORM_FEE' AND fee.direction = 'CREDIT') AS platform_fee_minor
          FROM order_items child
          JOIN order_items parent ON parent.order_id = ? AND parent.supplier_tenant_id = ?
            AND parent.product_id <=> child.product_id AND parent.variant_id <=> child.variant_id
            AND parent.sku <=> child.sku AND parent.quantity = child.quantity
            AND parent.line_subtotal_minor = child.line_subtotal_minor
          JOIN commission_ledger sale ON sale.order_id = parent.order_id AND sale.order_item_id = parent.id
            AND sale.beneficiary_tenant_id = ? AND sale.beneficiary_type = 'SUPPLIER'
            AND sale.entry_type = 'SALE' AND sale.direction = 'CREDIT'
          WHERE child.order_id = ? AND child.tenant_id = ?`,
        [order.parent_order_id, order.tenant_id, order.tenant_id, order.id, order.tenant_id]);
      const [{ count }] = await runner.query('SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?', [order.id]);
      if (lines.length !== Number(count) || new Set(lines.map((line) => String(line.id))).size !== lines.length
        || lines.reduce((sum, line) => sum + BigInt(line.net_minor), 0n) !== BigInt(order.total_minor)
        || lines.reduce((sum, line) => sum + BigInt(line.line_subtotal_minor), 0n) !== BigInt(order.subtotal_minor)
        || lines.some((line) => BigInt(line.net_minor) < 0n || BigInt(line.net_minor) > BigInt(line.line_subtotal_minor))) {
        throw new Error(`Supplier order ${order.id} requires manual reconciliation: ambiguous or missing sale evidence`);
      }
      for (const line of lines) {
        await runner.query(`UPDATE order_items
          SET line_discount_minor = ?, line_total_minor = ?, line_tax_minor = 0, commission_minor = ?,
              properties = JSON_SET(COALESCE(properties, JSON_OBJECT()), '$.marketplacePlatformFeeMinor', ?)
          WHERE id = ? AND order_id = ? AND tenant_id = ?`,
        [(BigInt(line.line_subtotal_minor) - BigInt(line.net_minor)).toString(), line.net_minor,
          line.commission_minor, String(line.platform_fee_minor), line.id, order.id, order.tenant_id]);
      }
      await runner.query('UPDATE orders SET discount_minor = subtotal_minor - total_minor WHERE id = ? AND tenant_id = ?',
        [order.id, order.tenant_id]);
    }
  }

  async down(): Promise<void> {
    // Retain reconciled historical money snapshots on application rollback.
  }
}
