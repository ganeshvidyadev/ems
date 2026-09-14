import 'reflect-metadata';
import { ShipmentController } from '../../src/modules/order/shipment.controller';

describe('Shipment order lookup', () => {
  it('resolves the tenant-scoped public order ID before querying the foreign key', async () => {
    const findByOrder = jest.fn().mockResolvedValue([]);
    const findByPublicIdOrFail = jest.fn().mockResolvedValue({ id: '42', publicId: 'public-order' });
    const controller = new ShipmentController({ findByOrder } as never, {} as never, {} as never, { findByPublicIdOrFail } as never);
    await expect(controller.listForOrder('public-order')).resolves.toEqual([]);
    expect(findByPublicIdOrFail).toHaveBeenCalledWith('public-order');
    expect(findByOrder).toHaveBeenCalledWith('42');
  });

  it('does not query shipments when the order is not visible to the tenant', async () => {
    const findByOrder = jest.fn();
    const controller = new ShipmentController({ findByOrder } as never, {} as never, {} as never,
      { findByPublicIdOrFail: async () => { throw new Error('Order not found'); } } as never);
    await expect(controller.listForOrder('other-tenant-order')).rejects.toThrow('not found');
    expect(findByOrder).not.toHaveBeenCalled();
  });
});
