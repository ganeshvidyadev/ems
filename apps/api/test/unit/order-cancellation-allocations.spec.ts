import 'reflect-metadata';
import { OrderService } from '../../src/modules/order/order.service';

describe('Cancellation inventory effects', () => {
  const restock = jest.fn();
  const releaseByProduct = jest.fn();
  const saveItem = jest.fn();

  function setup(status: string, fulfilled = 0, tracked = true) {
    jest.clearAllMocks();
    const order = { id: 'order', status, isCancellable: true };
    const item = {
      productId: tracked ? 'product' : null, warehouseId: tracked ? 'a' : null, variantId: null,
      quantity: 8, quantityFulfilled: fulfilled, quantityCancelled: 0, quantityOpen: 8 - fulfilled,
      stockAllocations: tracked ? [{ warehouseId: 'a', quantity: 3 }, { warehouseId: 'b', quantity: 5 }] : [],
    };
    const service = Object.create(OrderService.prototype) as OrderService;
    Object.assign(service, {
      manager: { transaction: async (work: (tx: object) => Promise<unknown>) => work({}) },
      orders: { withManager: () => ({ findByPublicIdOrFail: async () => order, save: async () => order }) },
      orderItems: { withManager: () => ({ findByOrder: async () => [item], save: saveItem }) },
      statusHistory: { withManager: () => ({ record: async () => undefined }) },
      inventory: { restock, releaseByProduct, orderLineAllocations: async () => item.stockAllocations }, context: {},
    });
    return { service, item };
  }

  it('releases unpaid reservations at both warehouses', async () => {
    const { service } = setup('PENDING');
    await service.cancel('public-order');
    expect(releaseByProduct.mock.calls.map((call) => [call[1].warehouseId, call[1].quantity])).toEqual([['a', 3], ['b', 5]]);
    expect(restock).not.toHaveBeenCalled();
  });

  it('restocks only the remainder after a partial pick', async () => {
    const { service, item } = setup('CONFIRMED', 4);
    await service.cancel('public-order');
    expect(restock).toHaveBeenCalledTimes(1);
    expect(restock.mock.calls[0]![1]).toMatchObject({ warehouseId: 'b', quantity: 4 });
    expect(item.quantityCancelled).toBe(4);
    expect(releaseByProduct).not.toHaveBeenCalled();
  });

  it('also cancels non-stock-tracked order lines', async () => {
    const { service, item } = setup('CONFIRMED', 0, false);
    await service.cancel('public-order');
    expect(item.quantityCancelled).toBe(8);
    expect(saveItem).toHaveBeenCalledWith(item);
    expect(restock).not.toHaveBeenCalled();
  });
});
