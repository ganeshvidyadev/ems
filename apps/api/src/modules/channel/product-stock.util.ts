import type { EntityManager } from 'typeorm';

/** Total sellable stock across every warehouse — shared by publish (initial quantity) and sync (ongoing push). */
export async function fetchAvailableStock(manager: EntityManager, productId: string, variantId: string | null): Promise<number> {
  const rows = (await manager.query(
    variantId
      ? `SELECT COALESCE(SUM(quantity_available), 0) AS qty FROM inventory_levels WHERE product_id = ? AND variant_id = ?`
      : `SELECT COALESCE(SUM(quantity_available), 0) AS qty FROM inventory_levels WHERE product_id = ? AND variant_id IS NULL`,
    variantId ? [productId, variantId] : [productId],
  )) as { qty: number }[];
  return Number(rows[0]?.qty ?? 0);
}
