import { Money } from '@ems/kernel';
import type { CommissionLedgerEntity } from '../../src/database/entities';
import { buildReversalLedgerEntries, buildSaleLedgerEntries } from '../../src/modules/marketplace/ledger-entry.builder';

describe('buildSaleLedgerEntries', () => {
  const gross = Money.fromMinor('10000', 'INR');
  const resellerCommission = Money.fromMinor('2000', 'INR');
  const platformFee = Money.fromMinor('500', 'INR');
  const supplierNet = Money.fromMinor('7500', 'INR'); // 10000 - 2000 - 500

  const entries = buildSaleLedgerEntries({
    orderId: '1',
    orderItemId: '10',
    supplierTenantId: '100',
    resellerTenantId: '200',
    gross,
    resellerCommission,
    platformFee,
    supplierNet,
    correlationId: 'corr-1',
  });

  it('produces exactly four rows', () => {
    expect(entries).toHaveLength(4);
  });

  it('debits and credits balance to exactly zero', () => {
    const signed = entries.reduce((sum, e) => {
      const amount = BigInt(e.netMinor!);
      return sum + (e.direction === 'CREDIT' ? amount : -amount);
    }, 0n);
    expect(signed).toBe(0n);
  });

  it('the DEBIT row is the reseller receiving the full gross', () => {
    const debit = entries.find((e) => e.direction === 'DEBIT')!;
    expect(debit.beneficiaryType).toBe('RESELLER');
    expect(debit.beneficiaryTenantId).toBe('200');
    expect(debit.netMinor).toBe(gross.amountMinor.toString());
    expect(debit.entryType).toBe('SALE');
  });

  it('credits the reseller their commission, the supplier their net, and the platform its fee', () => {
    const credits = entries.filter((e) => e.direction === 'CREDIT');
    expect(credits).toHaveLength(3);

    const resellerCredit = credits.find((e) => e.beneficiaryType === 'RESELLER')!;
    expect(resellerCredit.netMinor).toBe(resellerCommission.amountMinor.toString());
    expect(resellerCredit.entryType).toBe('COMMISSION');

    const supplierCredit = credits.find((e) => e.beneficiaryType === 'SUPPLIER')!;
    expect(supplierCredit.beneficiaryTenantId).toBe('100');
    expect(supplierCredit.netMinor).toBe(supplierNet.amountMinor.toString());
    expect(supplierCredit.entryType).toBe('SALE');

    const platformCredit = credits.find((e) => e.beneficiaryType === 'PLATFORM')!;
    expect(platformCredit.beneficiaryTenantId).toBeNull();
    expect(platformCredit.netMinor).toBe(platformFee.amountMinor.toString());
    expect(platformCredit.entryType).toBe('PLATFORM_FEE');
  });

  it('every row gets a distinct publicId', () => {
    const ids = new Set(entries.map((e) => e.publicId));
    expect(ids.size).toBe(4);
  });

  it('carries the order/orderItem/correlation ids onto every row', () => {
    for (const entry of entries) {
      expect(entry.orderId).toBe('1');
      expect(entry.orderItemId).toBe('10');
      expect(entry.correlationId).toBe('corr-1');
      expect(entry.currency).toBe('INR');
    }
  });
});

describe('buildReversalLedgerEntries', () => {
  const originals = buildSaleLedgerEntries({
    orderId: '1',
    orderItemId: '10',
    supplierTenantId: '100',
    resellerTenantId: '200',
    gross: Money.fromMinor('10000', 'INR'),
    resellerCommission: Money.fromMinor('2000', 'INR'),
    platformFee: Money.fromMinor('500', 'INR'),
    supplierNet: Money.fromMinor('7500', 'INR'),
    correlationId: null,
  }).map((e, i) => ({ ...e, id: String(i + 1) })) as CommissionLedgerEntity[];

  it('a full reversal (proportion 1/1) mirrors every original\'s direction and amount exactly', () => {
    const reversals = buildReversalLedgerEntries(originals, { numerator: 1n, denominator: 1n }, null);

    expect(reversals).toHaveLength(originals.length);
    for (const [i, reversal] of reversals.entries()) {
      const original = originals[i]!;
      expect(reversal.netMinor).toBe(original.netMinor);
      expect(reversal.direction).toBe(original.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT');
      expect(reversal.entryType).toBe('REFUND_REVERSAL');
      expect(reversal.reversesEntryId).toBe(original.id);
      expect(reversal.settlementId).toBeNull();
    }
  });

  it('still balances to zero after a full reversal is combined with the originals', () => {
    const reversals = buildReversalLedgerEntries(originals, { numerator: 1n, denominator: 1n }, null);
    const all = [...originals, ...reversals];
    const signed = all.reduce((sum, e) => {
      const amount = BigInt(e.netMinor!);
      return sum + (e.direction === 'CREDIT' ? amount : -amount);
    }, 0n);
    expect(signed).toBe(0n);
  });

  it('a half reversal (proportion 1/2) mirrors exactly half of each original amount', () => {
    const reversals = buildReversalLedgerEntries(originals, { numerator: 1n, denominator: 2n }, null);
    for (const [i, reversal] of reversals.entries()) {
      const original = originals[i]!;
      expect(BigInt(reversal.netMinor!)).toBe(BigInt(original.netMinor!) / 2n);
    }
  });

  it('never settles a reversal, even when reversing an already-settled entry', () => {
    const settledOriginals = originals.map((e) => ({ ...e, settlementId: '999' })) as CommissionLedgerEntity[];
    const reversals = buildReversalLedgerEntries(settledOriginals, { numerator: 1n, denominator: 1n }, null);
    for (const reversal of reversals) {
      expect(reversal.settlementId).toBeNull();
    }
  });
});
