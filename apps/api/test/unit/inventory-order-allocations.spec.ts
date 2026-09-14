import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Legacy inventory allocation recovery', () => {
  const query = jest.fn();
  const context = new RequestContextService();
  const service = Object.create(InventoryService.prototype) as InventoryService;
  Object.assign(service, { context });
  const item = { orderId: 'order', productId: 'product', variantId: null, quantity: 8, warehouseId: 'a', stockAllocations: null };
  const recover = () => context.run(RequestContextService.systemContext({ tenantId: 'tenant-a' }),
    () => service.orderLineAllocations({ query } as unknown as EntityManager, item));

  beforeEach(() => jest.clearAllMocks());

  it('reconstructs a split allocation in journal order with tenant and variant scoping', async () => {
    query.mockResolvedValue([{ warehouseId: 'a', quantity: '3' }, { warehouseId: 'b', quantity: '5' }]);
    await expect(recover()).resolves.toEqual([{ warehouseId: 'a', quantity: 3 }, { warehouseId: 'b', quantity: 5 }]);
    expect(query.mock.calls[0]![1]).toEqual(['tenant-a', 'order', 'product', null]);
  });

  it('rejects an ambiguous journal instead of using the first warehouse', async () => {
    query.mockResolvedValue([{ warehouseId: 'a', quantity: '10' }]);
    await expect(recover()).rejects.toThrow('require reconciliation');
  });

  it('retains the legacy single-warehouse fallback when no reservation journal exists', async () => {
    query.mockResolvedValue([]);
    await expect(recover()).resolves.toEqual([{ warehouseId: 'a', quantity: 8 }]);
  });

  it('reads a durable snapshot without any journal query', async () => {
    const stockAllocations = [{ warehouseId: 'a', quantity: 8 }];
    await expect(service.orderLineAllocations({ query } as unknown as EntityManager, { ...item, stockAllocations })).resolves.toEqual(stockAllocations);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('Inventory release integrity', () => {
  it('does not record a successful release when the conditional update fails', async () => {
    const record = jest.fn();
    const levels = { releaseReserved: async () => false, findOneOrFail: jest.fn() };
    const movements = { record };
    const service = Object.create(InventoryService.prototype) as InventoryService;
    Object.assign(service, {
      levels, movements, scopedTo: (_manager: unknown, repository: unknown) => repository,
    });
    await expect(service.releaseAllocations({} as EntityManager,
      [{ levelId: 'level', warehouseId: 'warehouse', quantity: 2 }],
      { productId: 'product', variantId: null, referenceType: 'ORDER', referenceId: 'order' },
    )).rejects.toThrow('could not be released');
    expect(record).not.toHaveBeenCalled();
  });
});
