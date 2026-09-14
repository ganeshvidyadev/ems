import { BusinessRuleError } from '@ems/kernel';

export interface OrderStockAllocation {
  warehouseId: string;
  quantity: number;
}

/** Immutable allocation order doubles as the picking order for partial fulfilment.
 * Slice only the requested unit range; cancellation must not restock shipped units.
 */
export function allocationRange(
  allocations: readonly OrderStockAllocation[],
  total: number,
  offset: number,
  quantity: number,
): OrderStockAllocation[] {
  if (![total, offset, quantity].every(Number.isSafeInteger) || total < 0 || offset < 0 ||
      quantity < 0 || offset + quantity > total ||
      allocations.some((a) => !a.warehouseId || !Number.isSafeInteger(a.quantity) || a.quantity <= 0) ||
      allocations.reduce((sum, a) => sum + a.quantity, 0) !== total) {
    throw new BusinessRuleError('Order stock allocations require reconciliation');
  }
  let cursor = 0;
  return allocations.flatMap((allocation) => {
    const start = cursor;
    cursor += allocation.quantity;
    const count = Math.max(0, Math.min(cursor, offset + quantity) - Math.max(start, offset));
    return count ? [{ warehouseId: allocation.warehouseId, quantity: count }] : [];
  });
}
