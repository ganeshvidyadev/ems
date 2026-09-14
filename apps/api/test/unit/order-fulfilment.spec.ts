import 'reflect-metadata';
import { OrderService } from '../../src/modules/order/order.service';
import type { FulfilOrderRequest } from '@ems/contracts';

describe('Order fulfilment ownership and quantities', () => {
  const findOrder = jest.fn();
  const findItem = jest.fn();
  const createShipment = jest.fn();
  let service: OrderService;
  const input = (items: { orderItemId: string; quantity: number }[]) => ({ items, notifyCustomer: false }) as FulfilOrderRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.create(OrderService.prototype) as OrderService;
    findOrder.mockResolvedValue({ id: 'order-a', status: 'CONFIRMED', isFulfillable: true, fulfilmentStatus: 'UNFULFILLED' });
    findItem.mockImplementation(async ({ where }) => {
      if (where.id !== 'item-a' || where.orderId !== 'order-a') throw new Error('Order item not found');
      return { id: 'item-a', orderId: 'order-a', quantityOpen: 3 };
    });
    Object.assign(service, {
      manager: { transaction: async (work: (tx: object) => Promise<unknown>) => work({}) },
      orders: { withManager: () => ({ findByPublicIdOrFail: findOrder }) },
      orderItems: { withManager: () => ({ findOneOrFail: findItem }) },
      statusHistory: { withManager: () => ({}) },
      shipments: { withManager: () => ({ insert: createShipment }) },
      shipmentItems: { withManager: () => ({}) },
    });
  });

  it('rejects an item from another order before shipping', async () => {
    await expect(service.fulfil('public-a', input([{ orderItemId: 'item-b', quantity: 1 }]))).rejects.toThrow('not found');
    expect(findItem).toHaveBeenCalledWith({ where: { id: 'item-b', orderId: 'order-a' } });
    expect(createShipment).not.toHaveBeenCalled();
    expect(findOrder).toHaveBeenCalledWith('public-a', { lock: { mode: 'pessimistic_write' } });
  });

  it('rejects duplicate lines that together exceed the available quantity', async () => {
    await expect(service.fulfil('public-a', input([
      { orderItemId: 'item-a', quantity: 2 }, { orderItemId: 'item-a', quantity: 2 },
    ]))).rejects.toThrow('only appear once');
    expect(createShipment).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid quantity %s before looking up a line', async (quantity) => {
    await expect(service.fulfil('public-a', input([{ orderItemId: 'item-a', quantity }]))).rejects.toThrow('positive integer');
    expect(findItem).not.toHaveBeenCalled();
  });

  it('rejects a quantity above the remaining balance', async () => {
    await expect(service.fulfil('public-a', input([{ orderItemId: 'item-a', quantity: 4 }]))).rejects.toThrow('only 3');
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('rejects empty fulfilment', async () => {
    await expect(service.fulfil('public-a', input([]))).rejects.toThrow('At least one');
    expect(createShipment).not.toHaveBeenCalled();
  });
});
