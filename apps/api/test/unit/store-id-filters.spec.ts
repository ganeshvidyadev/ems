import 'reflect-metadata';
import { OrderService } from '../../src/modules/order/order.service';
import { DailySalesRollupRepository, rollupStoreFilter } from '../../src/modules/report/daily-sales-rollup.repository';

// BUG-014: list/report filters arrive as public ids but the columns hold internal ids.
describe('Order list public-id filters', () => {
  const resolveId = jest.fn();
  const listFiltered = jest.fn();
  let service: OrderService;
  const list = (filter: { storeId?: string; customerId?: string; status?: string }) =>
    service.list({ page: 2, limit: 10, filter, sort: [] });

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.create(OrderService.prototype) as OrderService;
    resolveId.mockImplementation(async (table: string, publicId: string) =>
      ({ 'stores:STORE_A': '7', 'customers:CUST_A': '24' })[`${table}:${publicId}`] ?? null,
    );
    listFiltered.mockResolvedValue({ items: [{ id: '1' }], total: 1 });
    Object.assign(service, { orders: { resolveId, listFiltered } });
  });

  it('filters by the internal ids the public ids resolve to', async () => {
    await expect(list({ storeId: 'STORE_A', customerId: 'CUST_A', status: 'PAID' })).resolves.toEqual({ items: [{ id: '1' }], total: 1 });
    expect(resolveId).toHaveBeenCalledWith('stores', 'STORE_A');
    expect(resolveId).toHaveBeenCalledWith('customers', 'CUST_A');
    expect(listFiltered).toHaveBeenCalledWith({ storeId: '7', customerId: '24', status: 'PAID' }, [], 10, 10);
  });

  it.each([
    ['store', { storeId: 'OTHER_TENANT_STORE' }],
    ['customer', { customerId: 'OTHER_TENANT_CUSTOMER' }],
    ['store alongside a valid customer', { storeId: 'OTHER_TENANT_STORE', customerId: 'CUST_A' }],
  ])('returns nothing for an unresolvable %s instead of dropping the filter', async (_label, filter) => {
    await expect(list(filter)).resolves.toEqual({ items: [], total: 0 });
    expect(listFiltered).not.toHaveBeenCalled();
  });

  it('leaves an unfiltered list unchanged', async () => {
    await list({});
    expect(resolveId).not.toHaveBeenCalled();
    expect(listFiltered).toHaveBeenCalledWith({ storeId: undefined, customerId: undefined }, [], 10, 10);
  });
});

describe('Sales rollup store filter', () => {
  const query = jest.fn();
  let repo: DailySalesRollupRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([{ ordersCount: '3' }]);
    repo = Object.create(DailySalesRollupRepository.prototype) as DailySalesRollupRepository;
    Object.defineProperty(repo, 'tenantId', { get: () => 'tenant-1' });
    Object.assign(repo, { manager: { query } });
  });

  it('resolves the public store id inside the same tenant', () => {
    expect(rollupStoreFilter('tenant-1', 'STORE_A')).toEqual({
      clause: 'AND store_id = (SELECT s.id FROM stores s WHERE s.public_id = ? AND s.tenant_id = ?)',
      params: ['STORE_A', 'tenant-1'],
    });
    expect(rollupStoreFilter('tenant-1', null)).toEqual({ clause: '', params: [] });
  });

  it.each(['sumRange', 'listByDay'] as const)('%s binds the public id through the tenant-scoped subquery', async (method) => {
    await repo[method]('STORE_A', '2026-10-01', '2026-10-10');
    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toContain('store_id = (SELECT s.id FROM stores s WHERE s.public_id = ? AND s.tenant_id = ?)');
    expect(params).toEqual(['tenant-1', '2026-10-01', '2026-10-10', 'STORE_A', 'tenant-1']);
  });

  it.each(['sumRange', 'listByDay'] as const)('%s without a store keeps the tenant-wide query', async (method) => {
    await repo[method](null, '2026-10-01', '2026-10-10');
    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).not.toContain('store_id');
    expect(params).toEqual(['tenant-1', '2026-10-01', '2026-10-10']);
  });
});
