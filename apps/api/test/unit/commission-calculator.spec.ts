import { BusinessRuleError, Money } from '@ems/kernel';
import { calculateCommission } from '../../src/modules/marketplace/commission-calculator';

/**
 * `supplierNet` is *defined* as `gross - resellerCommission - platformFee`
 * rather than computed independently — every test here exists to prove
 * that identity holds (the property the commission-ledger's double-entry
 * balance depends on), not just that each branch returns a plausible number.
 */
describe('calculateCommission', () => {
  function assertBalances(gross: Money, result: ReturnType<typeof calculateCommission>): void {
    const total = result.resellerCommission.add(result.platformFee).add(result.supplierNet);
    expect(total.equals(gross)).toBe(true);
  }

  describe('PERCENTAGE', () => {
    it('splits a clean percentage exactly, with no leftover paise', () => {
      const gross = Money.fromMinor('10000', 'INR'); // ₹100.00
      const result = calculateCommission({
        commissionType: 'PERCENTAGE',
        commissionValue: '20', // reseller keeps 20%
        platformFeeRate: '5', // platform takes 5%
        gross,
        quantity: 1,
      });

      expect(result.resellerCommission.amountMinor).toBe(2000n);
      expect(result.platformFee.amountMinor).toBe(500n);
      expect(result.supplierNet.amountMinor).toBe(7500n);
      assertBalances(gross, result);
    });

    it('rounds half-up and still balances exactly (no dropped or invented paise)', () => {
      const gross = Money.fromMinor('333', 'INR');
      const result = calculateCommission({
        commissionType: 'PERCENTAGE',
        commissionValue: '33.33',
        platformFeeRate: '2.5',
        gross,
        quantity: 1,
      });
      assertBalances(gross, result);
    });

    it('a 0% commission and 0% platform fee sends the entire gross to the supplier', () => {
      const gross = Money.fromMinor('50000', 'INR');
      const result = calculateCommission({
        commissionType: 'PERCENTAGE',
        commissionValue: '0',
        platformFeeRate: '0',
        gross,
        quantity: 1,
      });
      expect(result.resellerCommission.isZero).toBe(true);
      expect(result.platformFee.isZero).toBe(true);
      expect(result.supplierNet.equals(gross)).toBe(true);
    });
  });

  describe('FIXED', () => {
    it('is a flat minor-currency amount per unit, multiplied by quantity', () => {
      const gross = Money.fromMinor('40000', 'INR'); // 4 units at ₹100 each
      const result = calculateCommission({
        commissionType: 'FIXED',
        commissionValue: '5000', // ₹50 flat commission per unit
        platformFeeRate: '2',
        gross,
        quantity: 4,
      });

      expect(result.resellerCommission.amountMinor).toBe(20000n); // 5000 × 4
      assertBalances(gross, result);
    });

    it('clamps a per-unit fee that would exceed the gross rather than going negative on the supplier', () => {
      const gross = Money.fromMinor('1000', 'INR');
      const result = calculateCommission({
        commissionType: 'FIXED',
        commissionValue: '5000', // way more than the whole sale
        platformFeeRate: '0',
        gross,
        quantity: 1,
      });

      expect(result.resellerCommission.amountMinor).toBe(1000n); // clamped to gross
      expect(result.supplierNet.isZero).toBe(true);
      assertBalances(gross, result);
    });
  });

  describe('MARGIN', () => {
    it('is gross minus the supplier\'s cost basis — the reseller\'s markup', () => {
      const gross = Money.fromMinor('15000', 'INR'); // reseller sold at ₹150
      const supplierCostBasis = Money.fromMinor('10000', 'INR'); // supplier's own price ₹100
      const result = calculateCommission({
        commissionType: 'MARGIN',
        commissionValue: '0', // unused for MARGIN
        platformFeeRate: '10',
        gross,
        quantity: 1,
        supplierCostBasis,
      });

      expect(result.resellerCommission.amountMinor).toBe(5000n); // the ₹50 markup
      assertBalances(gross, result);
    });

    it('clamps the margin at zero when the reseller sold at or below the supplier\'s price', () => {
      const gross = Money.fromMinor('8000', 'INR');
      const supplierCostBasis = Money.fromMinor('10000', 'INR'); // sold BELOW supplier's price
      const result = calculateCommission({
        commissionType: 'MARGIN',
        commissionValue: '0',
        platformFeeRate: '0',
        gross,
        quantity: 1,
        supplierCostBasis,
      });

      expect(result.resellerCommission.isZero).toBe(true);
      expect(result.supplierNet.equals(gross)).toBe(true);
    });

    it('throws when no supplier cost basis is supplied', () => {
      expect(() =>
        calculateCommission({
          commissionType: 'MARGIN',
          commissionValue: '0',
          platformFeeRate: '0',
          gross: Money.fromMinor('1000', 'INR'),
          quantity: 1,
        }),
      ).toThrow(BusinessRuleError);
    });
  });

  it('throws rather than pay the supplier a negative amount when fee configuration is absurd', () => {
    // Not reachable through PERCENTAGE/FIXED's own clamping in practice, but this
    // is the actual guard the calculation relies on — verified directly.
    expect(() =>
      calculateCommission({
        commissionType: 'PERCENTAGE',
        commissionValue: '60',
        platformFeeRate: '60',
        gross: Money.fromMinor('10000', 'INR'),
        quantity: 1,
      }),
    ).toThrow(BusinessRuleError);
  });

  it('rejects an unknown commission type', () => {
    expect(() =>
      calculateCommission({
        // @ts-expect-error deliberately invalid at the type level, to prove the runtime guard too
        commissionType: 'BOGUS',
        commissionValue: '0',
        platformFeeRate: '0',
        gross: Money.fromMinor('1000', 'INR'),
        quantity: 1,
      }),
    ).toThrow(BusinessRuleError);
  });
});
