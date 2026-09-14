import { allocationRange } from '../../src/modules/order/stock-allocations';

describe('Durable order stock allocation ranges', () => {
  const allocations = [{ warehouseId: 'a', quantity: 2 }, { warehouseId: 'b', quantity: 5 }, { warehouseId: 'c', quantity: 3 }];

  it('commits the full order against every original warehouse', () => {
    expect(allocationRange(allocations, 10, 0, 10)).toEqual(allocations);
  });

  it('cancels only unshipped units after picking across a warehouse boundary', () => {
    expect(allocationRange(allocations, 10, 4, 6)).toEqual([
      { warehouseId: 'b', quantity: 3 }, { warehouseId: 'c', quantity: 3 },
    ]);
  });

  it('preserves exact quantities for every valid range', () => {
    for (let offset = 0; offset <= 10; offset += 1) {
      for (let quantity = 0; quantity <= 10 - offset; quantity += 1) {
        const range = allocationRange(allocations, 10, offset, quantity);
        expect(range.reduce((sum, a) => sum + a.quantity, 0)).toBe(quantity);
        expect(range.every((a) => a.quantity > 0 && a.quantity <= allocations.find((original) => original.warehouseId === a.warehouseId)!.quantity)).toBe(true);
      }
    }
    expect(allocations).toEqual([{ warehouseId: 'a', quantity: 2 }, { warehouseId: 'b', quantity: 5 }, { warehouseId: 'c', quantity: 3 }]);
  });

  it.each([{ total: 9, offset: 0, quantity: 9 }, { total: 10, offset: -1, quantity: 2 },
    { total: 10, offset: 8, quantity: 3 }, { total: 10, offset: 0.5, quantity: 2 }])('rejects inconsistent allocation range %j', ({ total, offset, quantity }) => {
    expect(() => allocationRange(allocations, total, offset, quantity)).toThrow('reconciliation');
  });

  it('rejects a corrupted persisted quantity', () => {
    expect(() => allocationRange([{ warehouseId: 'a', quantity: -1 }], -1, 0, 0)).toThrow();
  });
});
