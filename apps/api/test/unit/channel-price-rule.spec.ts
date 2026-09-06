import { Money } from '@ems/kernel';
import { applyChannelPriceRule } from '../../src/modules/channel/listing-publish.service';

describe('applyChannelPriceRule', () => {
  it('passes the price through unchanged with no settings at all', () => {
    const result = applyChannelPriceRule('10000', 'INR', null);
    expect(result.amountMinor).toBe(10000n);
  });

  it('applies a percent markup', () => {
    const result = applyChannelPriceRule('10000', 'INR', { priceAdjustmentPercent: '10' });
    expect(result.amountMinor).toBe(11000n); // +10%
  });

  it('applies a percent markdown via a negative percentage', () => {
    const result = applyChannelPriceRule('10000', 'INR', { priceAdjustmentPercent: '-10' });
    expect(result.amountMinor).toBe(9000n);
  });

  it('applies a flat minor-currency add-on', () => {
    const result = applyChannelPriceRule('10000', 'INR', { priceAdjustmentFlatMinor: '500' });
    expect(result.amountMinor).toBe(10500n);
  });

  it('applies the percent markup first, then the flat add-on on top', () => {
    const result = applyChannelPriceRule('10000', 'INR', {
      priceAdjustmentPercent: '10',
      priceAdjustmentFlatMinor: '500',
    });
    // 10000 * 1.10 = 11000, + 500 = 11500 — order matters, and this pins it down.
    expect(result.amountMinor).toBe(11500n);
  });

  it('returns a Money in the same currency as the input', () => {
    const result = applyChannelPriceRule('10000', 'INR', { priceAdjustmentPercent: '10' });
    expect(result.currency).toBe('INR');
    expect(result.equals(Money.fromMinor('11000', 'INR'))).toBe(true);
  });
});
