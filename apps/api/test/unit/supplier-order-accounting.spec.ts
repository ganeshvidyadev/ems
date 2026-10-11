import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { MarketplaceOrderService } from '../../src/modules/marketplace/marketplace-order.service';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Supplier order accounting', () => {
  it('reconciles discounted, mixed-commission lines to the supplier ledger without changing the reseller sale', async () => {
    const context = new RequestContextService();
    const parent = { id: '10', tenantId: '1', orderNumber: 'ORD-10', currency: 'INR' };
    const lines = [
      { id: '100', productId: '20', quantity: 2, lineSubtotalMinor: '90000', lineDiscountMinor: '10000', unitPriceMinor: '45000', supplierTenantId: '2', commissionMinor: null },
      { id: '101', productId: '21', quantity: 1, lineSubtotalMinor: '10001', lineDiscountMinor: '0', unitPriceMinor: '10001', supplierTenantId: '2', commissionMinor: null },
    ];
    const orders = { withManager: jest.fn().mockReturnThis(), findOneOrFail: jest.fn().mockResolvedValue(parent), nextOrderNumber: jest.fn().mockResolvedValue('SUP-1'), insert: jest.fn().mockResolvedValue({ id: '11' }) };
    const items = { withManager: jest.fn().mockReturnThis(), findByOrder: jest.fn().mockResolvedValue(lines), update: jest.fn(), insert: jest.fn() };
    const shares = { findExisting: jest.fn().mockImplementation(async (_supplier, _reseller, productId) => ({ commissionType: 'PERCENTAGE', commissionValue: productId === '20' ? '20' : '10', platformFeeRate: '2' })) };
    const ledger = { withManager: jest.fn().mockReturnThis(), insertMany: jest.fn() };
    const tx = { query: jest.fn().mockResolvedValue([{ id: '5' }]) } as unknown as EntityManager;
    const service = new MarketplaceOrderService(tx, orders as never, items as never, shares as never, ledger as never, context);

    await context.run(RequestContextService.systemContext({ tenantId: '1' }), () => service.processConfirmedOrder(tx, '10'));

    const child = orders.insert.mock.calls[0]![0];
    const childLines = items.insert.mock.calls.map(([line]) => line);
    const supplierCredits = ledger.insertMany.mock.calls[0]![0].filter((entry: { beneficiaryType: string }) => entry.beneficiaryType === 'SUPPLIER');
    const net = supplierCredits.reduce((sum: bigint, entry: { netMinor: string }) => sum + BigInt(entry.netMinor), 0n);
    expect(BigInt(child.totalMinor)).toBe(net);
    expect(BigInt(child.subtotalMinor) - BigInt(child.discountMinor)).toBe(net);
    expect(child.amountPaidMinor).toBe(child.totalMinor);
    expect(childLines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n)).toBe(net);
    childLines.forEach((line, index) => {
      expect(BigInt(line.lineSubtotalMinor) - BigInt(line.lineDiscountMinor)).toBe(BigInt(line.lineTotalMinor));
      expect(line.lineTotalMinor).toBe(supplierCredits[index].netMinor);
      expect(BigInt(line.commissionMinor)).toBeGreaterThan(0n);
      expect(BigInt(line.properties.marketplacePlatformFeeMinor)).toBeGreaterThan(0n);
    });
    expect(lines[0]!.lineSubtotalMinor).toBe('90000');
    expect(lines[0]!.lineDiscountMinor).toBe('10000');
  });
});
