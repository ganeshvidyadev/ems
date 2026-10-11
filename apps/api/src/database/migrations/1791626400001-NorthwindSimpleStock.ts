import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NorthwindSimpleStock1791626400001 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Preserve stock quantities and slot IDs. Only the old demo seed's single-slot
    // SIMPLE products qualify; multiple slots require explicit reconciliation.
    await runner.query(`
      UPDATE inventory_levels il
      JOIN products p ON p.id = il.product_id AND p.tenant_id = il.tenant_id
      JOIN tenants t ON t.id = p.tenant_id
      JOIN (
        SELECT tenant_id, product_id, warehouse_id, MIN(id) AS slot_id
        FROM inventory_levels GROUP BY tenant_id, product_id, warehouse_id
        HAVING COUNT(*) = 1
      ) single_slot ON single_slot.slot_id = il.id
      SET il.variant_id = NULL
      WHERE t.slug = 'northwind' AND p.sku LIKE 'NW-%'
        AND p.type = 'SIMPLE' AND p.deleted_at IS NULL
        AND il.variant_id IS NOT NULL
    `);
  }

  async down(): Promise<void> {
    // Data correction: reintroducing an unpurchasable stock slot is not a rollback.
  }
}
