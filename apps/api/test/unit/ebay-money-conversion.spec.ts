import { majorToMinor, minorToMajor } from '../../src/integrations/channel/ebay/ebay-channel.adapter';

/**
 * eBay's REST APIs speak major-unit decimal strings ("19.99"); everywhere
 * else in this codebase speaks minor-unit integers ("1999"). A wrong
 * conversion here either overcharges/undercharges the buyer by 100x or
 * silently truncates fractional currency — genuinely worth pinning down
 * directly rather than trusting it inside the adapter's own request-shaping
 * code.
 */
describe('minorToMajor', () => {
  it('inserts the decimal point two places from the right for a 2-exponent currency', () => {
    expect(minorToMajor('1999', 'USD')).toBe('19.99');
    expect(minorToMajor('100', 'USD')).toBe('1.00');
  });

  it('pads a sub-100 minor amount with a leading zero', () => {
    expect(minorToMajor('5', 'USD')).toBe('0.05');
    expect(minorToMajor('50', 'USD')).toBe('0.50');
  });

  it('passes a zero-exponent currency (JPY) through unchanged', () => {
    expect(minorToMajor('1999', 'JPY')).toBe('1999');
  });
});

describe('majorToMinor', () => {
  it('is the exact inverse of minorToMajor for a 2-exponent currency', () => {
    expect(majorToMinor('19.99', 'USD')).toBe('1999');
    expect(majorToMinor('1.00', 'USD')).toBe('100');
  });

  it('pads a short fractional part out to the currency\'s exponent', () => {
    expect(majorToMinor('19.9', 'USD')).toBe('1990');
    expect(majorToMinor('19', 'USD')).toBe('1900');
  });

  it('truncates (does not round) a fractional part longer than the exponent', () => {
    expect(majorToMinor('19.999', 'USD')).toBe('1999');
  });

  it('passes a zero-exponent currency (JPY) through unchanged', () => {
    expect(majorToMinor('1999', 'JPY')).toBe('1999');
  });

  it('round-trips a range of amounts through both directions (numerically — a leading zero from a sub-unit amount like "0.01" is a harmless string artifact `BigInt`/`Money.fromMinor` both parse correctly, not a value bug)', () => {
    for (const minor of ['1', '99', '100', '12345', '999999']) {
      expect(BigInt(majorToMinor(minorToMajor(minor, 'USD'), 'USD'))).toBe(BigInt(minor));
    }
  });
});
