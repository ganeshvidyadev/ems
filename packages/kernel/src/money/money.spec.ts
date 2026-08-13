import { Money, MoneyError } from './money.js';

describe('Money', () => {
  describe('construction', () => {
    it('builds from minor units', () => {
      expect(Money.fromMinor(1999n, 'INR').toMajorString()).toBe('19.99');
    });

    it('accepts the string form MySQL BIGINT returns', () => {
      expect(Money.fromMinor('123456789012345', 'INR').amountMinor).toBe(123456789012345n);
    });

    it('rejects a non-integer number, pointing at fromMajor', () => {
      expect(() => Money.fromMinor(19.99, 'INR')).toThrow(/must be an integer/);
    });

    it('parses a major-unit decimal string exactly', () => {
      expect(Money.fromMajor('1234.56', 'INR').amountMinor).toBe(123456n);
    });

    it('respects a zero-decimal currency', () => {
      // JPY has no minor unit: 1000 yen is 1000 minor units, not 100000.
      expect(Money.fromMajor('1000', 'JPY').amountMinor).toBe(1000n);
      expect(Money.fromMinor(1000n, 'JPY').toMajorString()).toBe('1000');
    });

    it('respects a three-decimal currency', () => {
      expect(Money.fromMajor('1.234', 'KWD').amountMinor).toBe(1234n);
      expect(Money.fromMinor(1234n, 'KWD').toMajorString()).toBe('1.234');
    });

    it('rounds excess precision HALF_UP by default', () => {
      expect(Money.fromMajor('10.005', 'INR').amountMinor).toBe(1001n);
      expect(Money.fromMajor('10.004', 'INR').amountMinor).toBe(1000n);
    });

    it('supports HALF_EVEN (banker’s rounding)', () => {
      expect(Money.fromMajor('10.005', 'INR', 'HALF_EVEN').amountMinor).toBe(1000n);
      expect(Money.fromMajor('10.015', 'INR', 'HALF_EVEN').amountMinor).toBe(1002n);
    });

    it('handles negatives', () => {
      expect(Money.fromMajor('-45.50', 'INR').amountMinor).toBe(-4550n);
      expect(Money.fromMinor(-4550n, 'INR').toMajorString()).toBe('-45.50');
    });

    it('rejects an unsupported currency', () => {
      expect(() => Money.fromMinor(1n, 'XYZ' as never)).toThrow(MoneyError);
    });
  });

  describe('arithmetic', () => {
    it('adds and subtracts', () => {
      const a = Money.fromMajor('10.50', 'INR');
      const b = Money.fromMajor('4.25', 'INR');
      expect(a.add(b).toMajorString()).toBe('14.75');
      expect(a.subtract(b).toMajorString()).toBe('6.25');
    });

    it('refuses to mix currencies', () => {
      const inr = Money.fromMinor(100n, 'INR');
      const usd = Money.fromMinor(100n, 'USD');
      expect(() => inr.add(usd)).toThrow(/Currency mismatch/);
    });

    it('multiplies by an integer quantity exactly', () => {
      expect(Money.fromMajor('19.99', 'INR').multiplyByQuantity(3).toMajorString()).toBe('59.97');
    });

    it('computes a percentage without float drift', () => {
      // 18% GST on 1499.00
      expect(Money.fromMajor('1499.00', 'INR').percentage('18').toMajorString()).toBe('269.82');
    });

    it('handles fractional tax rates', () => {
      expect(Money.fromMajor('1000.00', 'INR').percentage('2.5').toMajorString()).toBe('25.00');
    });

    it('avoids the classic float failure', () => {
      // 0.1 + 0.2 !== 0.3 in IEEE-754; it must be exact here.
      const sum = Money.fromMajor('0.10', 'USD').add(Money.fromMajor('0.20', 'USD'));
      expect(sum.toMajorString()).toBe('0.30');
      expect(sum.equals(Money.fromMajor('0.30', 'USD'))).toBe(true);
    });

    it('stays exact far beyond Number.MAX_SAFE_INTEGER', () => {
      const huge = Money.fromMinor('9007199254740993', 'INR'); // MAX_SAFE_INTEGER + 2
      expect(huge.add(Money.fromMinor(1n, 'INR')).amountMinor).toBe(9007199254740994n);
    });
  });

  describe('allocate', () => {
    it('never loses or invents a minor unit on an uneven split', () => {
      const parts = Money.fromMajor('10.00', 'INR').allocate([1n, 1n, 1n]);
      expect(parts.map((p) => p.amountMinor)).toEqual([334n, 333n, 333n]);
      expect(Money.sum(parts).amountMinor).toBe(1000n);
    });

    it('allocates by weight', () => {
      // A 3-way commission split: 70% supplier / 20% reseller / 10% platform.
      const parts = Money.fromMajor('100.00', 'INR').allocate([70n, 20n, 10n]);
      expect(parts.map((p) => p.toMajorString())).toEqual(['70.00', '20.00', '10.00']);
      expect(Money.sum(parts).amountMinor).toBe(10000n);
    });

    it('keeps the sum invariant on an awkward weighting', () => {
      const total = Money.fromMinor(101n, 'INR');
      const parts = total.allocate([1n, 1n, 1n, 1n, 1n, 1n, 1n]);
      expect(Money.sum(parts).equals(total)).toBe(true);
    });

    it('is deterministic across runs', () => {
      const a = Money.fromMinor(1000n, 'INR').allocate([1n, 1n, 1n]);
      const b = Money.fromMinor(1000n, 'INR').allocate([1n, 1n, 1n]);
      expect(a.map((m) => m.amountMinor)).toEqual(b.map((m) => m.amountMinor));
    });

    it('handles negative amounts (refund splits)', () => {
      const parts = Money.fromMinor(-1000n, 'INR').allocate([1n, 1n, 1n]);
      expect(parts.map((p) => p.amountMinor)).toEqual([-334n, -333n, -333n]);
      expect(Money.sum(parts).amountMinor).toBe(-1000n);
    });

    it('supports a zero-weight participant', () => {
      const parts = Money.fromMinor(100n, 'INR').allocate([1n, 0n, 1n]);
      expect(parts.map((p) => p.amountMinor)).toEqual([50n, 0n, 50n]);
    });

    it('rejects a zero-sum ratio set', () => {
      expect(() => Money.fromMinor(100n, 'INR').allocate([0n, 0n])).toThrow(/sum to zero/);
    });

    it('splits evenly via split()', () => {
      expect(Money.fromMinor(100n, 'INR').split(3).map((m) => m.amountMinor)).toEqual([
        34n,
        33n,
        33n,
      ]);
    });
  });

  describe('comparison', () => {
    const ten = Money.fromMinor(1000n, 'INR');
    const five = Money.fromMinor(500n, 'INR');

    it('orders correctly', () => {
      expect(ten.greaterThan(five)).toBe(true);
      expect(five.lessThan(ten)).toBe(true);
      expect(ten.compare(ten)).toBe(0);
    });

    it('treats a different currency as unequal rather than throwing on equals', () => {
      expect(Money.fromMinor(1000n, 'INR').equals(Money.fromMinor(1000n, 'USD'))).toBe(false);
    });

    it('exposes sign predicates', () => {
      expect(Money.zero('INR').isZero).toBe(true);
      expect(ten.isPositive).toBe(true);
      expect(ten.negate().isNegative).toBe(true);
    });
  });

  describe('serialisation', () => {
    it('emits amountMinor as a string so JSON.stringify cannot throw on bigint', () => {
      const json = Money.fromMajor('1499.00', 'INR').toJSON();
      expect(json).toEqual({ amountMinor: '149900', currency: 'INR', formatted: '1499.00' });
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    it('round-trips through its own JSON shape', () => {
      const original = Money.fromMajor('98765.43', 'INR');
      const restored = Money.fromMinor(original.toJSON().amountMinor, original.currency);
      expect(restored.equals(original)).toBe(true);
    });

    it('is immutable', () => {
      const m = Money.fromMinor(100n, 'INR');
      expect(Object.isFrozen(m)).toBe(true);
    });
  });

  describe('sum', () => {
    it('adds a list', () => {
      const lines = [
        Money.fromMajor('19.99', 'INR'),
        Money.fromMajor('5.01', 'INR'),
        Money.fromMajor('100.00', 'INR'),
      ];
      expect(Money.sum(lines).toMajorString()).toBe('125.00');
    });

    it('requires an explicit currency for an empty list', () => {
      expect(() => Money.sum([])).toThrow(/explicit currency/);
      expect(Money.sum([], 'INR').isZero).toBe(true);
    });
  });
});
