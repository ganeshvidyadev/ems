import {
  type CurrencyCode,
  currencyMeta,
  isCurrencyCode,
  minorUnitFactor,
} from './currency.js';

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP';

/**
 * An immutable monetary amount held as an integer count of minor units.
 *
 * Why `bigint` and not `number`:
 *   0.1 + 0.2 === 0.30000000000000004
 * Cent-level drift compounds across order lines, tax, discount, and commission
 * splits until a merchant's payout does not reconcile. `Number.MAX_SAFE_INTEGER`
 * is also only ~90 trillion minor units, which a high-volume tenant's lifetime
 * GMV in paise can plausibly approach.
 *
 * Currency is part of the type, so adding INR to USD is an error rather than a
 * silently wrong number.
 */
export class Money {
  private constructor(
    /** Integer count of minor units (paise, cents, fils). May be negative. */
    public readonly amountMinor: bigint,
    public readonly currency: CurrencyCode,
  ) {
    Object.freeze(this);
  }

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  /** Primary constructor — this is how values arrive from the database. */
  static fromMinor(amountMinor: bigint | number | string, currency: CurrencyCode): Money {
    if (!isCurrencyCode(currency)) {
      throw new MoneyError(`Unsupported currency: ${String(currency)}`);
    }

    let value: bigint;
    if (typeof amountMinor === 'bigint') {
      value = amountMinor;
    } else if (typeof amountMinor === 'number') {
      if (!Number.isInteger(amountMinor)) {
        throw new MoneyError(
          `Minor units must be an integer, received ${amountMinor}. ` +
            `Use Money.fromMajor() for decimal input.`,
        );
      }
      if (!Number.isSafeInteger(amountMinor)) {
        throw new MoneyError(`Minor unit value ${amountMinor} exceeds safe integer range`);
      }
      value = BigInt(amountMinor);
    } else {
      // MySQL BIGINT arrives from the driver as a string.
      if (!/^-?\d+$/.test(amountMinor)) {
        throw new MoneyError(`Invalid minor unit string: "${amountMinor}"`);
      }
      value = BigInt(amountMinor);
    }

    return new Money(value, currency);
  }

  /**
   * Parse a human/major-unit value ("1234.56", 1234.56) into minor units.
   *
   * Accepts a string to avoid the float round-trip entirely; a `number` input is
   * routed through its decimal string form for the same reason.
   */
  static fromMajor(
    amountMajor: string | number,
    currency: CurrencyCode,
    rounding: RoundingMode = 'HALF_UP',
  ): Money {
    if (!isCurrencyCode(currency)) {
      throw new MoneyError(`Unsupported currency: ${String(currency)}`);
    }

    const raw = typeof amountMajor === 'number' ? amountMajor.toString() : amountMajor.trim();
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
    if (!match) {
      throw new MoneyError(`Invalid major unit amount: "${raw}"`);
    }

    const [, sign, whole = '0', fractionRaw = ''] = match;
    const exponent = currencyMeta(currency).exponent;

    const keep = fractionRaw.slice(0, exponent).padEnd(exponent, '0');
    const overflow = fractionRaw.slice(exponent);

    let minor = BigInt(whole) * minorUnitFactor(currency) + BigInt(keep || '0');
    minor = Money.applyRounding(minor, overflow, rounding);

    return new Money(sign === '-' ? -minor : minor, currency);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0n, currency);
  }

  /** Rounds the digits beyond the currency's precision into the last minor unit. */
  private static applyRounding(minor: bigint, overflow: string, mode: RoundingMode): bigint {
    if (overflow.length === 0 || /^0+$/.test(overflow)) return minor;

    switch (mode) {
      case 'DOWN':
        return minor;
      case 'UP':
        return minor + 1n;
      case 'HALF_EVEN': {
        const firstDigit = Number(overflow[0]);
        const isExactHalf = firstDigit === 5 && /^50*$/.test(overflow);
        if (isExactHalf) return minor % 2n === 0n ? minor : minor + 1n;
        return firstDigit >= 5 ? minor + 1n : minor;
      }
      case 'HALF_UP':
      default:
        return Number(overflow[0]) >= 5 ? minor + 1n : minor;
    }
  }

  // -------------------------------------------------------------------------
  // Arithmetic
  // -------------------------------------------------------------------------

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  /** Multiply by an integer quantity — the line-total case. Exact, no rounding. */
  multiplyByQuantity(quantity: number | bigint): Money {
    const q = typeof quantity === 'bigint' ? quantity : BigInt(quantity);
    if (typeof quantity === 'number' && !Number.isInteger(quantity)) {
      throw new MoneyError(`Quantity must be an integer, received ${quantity}`);
    }
    return new Money(this.amountMinor * q, this.currency);
  }

  /**
   * Multiply by a rational factor expressed as numerator/denominator, so a
   * percentage never passes through a float. 18% GST is `(18n, 100n)`.
   */
  multiplyByRatio(
    numerator: bigint,
    denominator: bigint,
    rounding: RoundingMode = 'HALF_UP',
  ): Money {
    if (denominator === 0n) throw new MoneyError('Division by zero in multiplyByRatio');

    const product = this.amountMinor * numerator;
    return new Money(Money.divideRounded(product, denominator, rounding), this.currency);
  }

  /**
   * Percentage helper. `percent` is a decimal string ("18", "2.5") to keep the
   * tax rate out of floating point.
   */
  percentage(percent: string | number, rounding: RoundingMode = 'HALF_UP'): Money {
    const raw = typeof percent === 'number' ? percent.toString() : percent.trim();
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
    if (!match) throw new MoneyError(`Invalid percentage: "${raw}"`);

    const [, sign, whole = '0', fraction = ''] = match;
    const scale = 10n ** BigInt(fraction.length);
    const numerator = (BigInt(whole) * scale + BigInt(fraction || '0')) * (sign === '-' ? -1n : 1n);

    return this.multiplyByRatio(numerator, 100n * scale, rounding);
  }

  negate(): Money {
    return new Money(-this.amountMinor, this.currency);
  }

  abs(): Money {
    return new Money(this.amountMinor < 0n ? -this.amountMinor : this.amountMinor, this.currency);
  }

  private static divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
    const negative = numerator < 0n !== denominator < 0n;
    const absNum = numerator < 0n ? -numerator : numerator;
    const absDen = denominator < 0n ? -denominator : denominator;

    const quotient = absNum / absDen;
    const remainder = absNum % absDen;
    if (remainder === 0n) return negative ? -quotient : quotient;

    let rounded: bigint;
    switch (mode) {
      case 'DOWN':
        rounded = quotient;
        break;
      case 'UP':
        rounded = quotient + 1n;
        break;
      case 'HALF_EVEN': {
        const twice = remainder * 2n;
        if (twice === absDen) rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
        else rounded = twice > absDen ? quotient + 1n : quotient;
        break;
      }
      case 'HALF_UP':
      default:
        rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
        break;
    }

    return negative ? -rounded : rounded;
  }

  // -------------------------------------------------------------------------
  // Allocation — splitting without losing or inventing minor units
  // -------------------------------------------------------------------------

  /**
   * Split this amount across `ratios` using the largest-remainder method.
   *
   * The invariant that matters: the parts always sum **exactly** back to the
   * original. Rounding each share independently loses or creates paise — which
   * is how a commission settlement ends up off by a few units and stops
   * reconciling. Remainder units are handed out one at a time to the largest
   * fractional remainders (ties broken by index, so the result is deterministic).
   *
   *   Money.fromMinor(10_00n,'INR').allocate([1n,1n,1n])
   *     → [334, 333, 333]  (sums to 1000)
   */
  allocate(ratios: readonly bigint[]): Money[] {
    if (ratios.length === 0) throw new MoneyError('allocate() requires at least one ratio');
    if (ratios.some((r) => r < 0n)) throw new MoneyError('allocate() ratios must be non-negative');

    const total = ratios.reduce((sum, r) => sum + r, 0n);
    if (total === 0n) throw new MoneyError('allocate() ratios must not sum to zero');

    const negative = this.amountMinor < 0n;
    const absAmount = negative ? -this.amountMinor : this.amountMinor;

    const shares: bigint[] = [];
    const remainders: { index: number; remainder: bigint }[] = [];
    let distributed = 0n;

    ratios.forEach((ratio, index) => {
      const exact = absAmount * ratio;
      const share = exact / total;
      shares.push(share);
      remainders.push({ index, remainder: exact % total });
      distributed += share;
    });

    let leftover = absAmount - distributed;
    remainders.sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return b.remainder > a.remainder ? 1 : -1;
    });

    for (let i = 0; leftover > 0n; i = (i + 1) % remainders.length) {
      const index = remainders[i]!.index;
      shares[index] = shares[index]! + 1n;
      leftover -= 1n;
    }

    return shares.map((s) => new Money(negative ? -s : s, this.currency));
  }

  /** Even split into `n` parts, remainder distributed to the earliest parts. */
  split(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1) {
      throw new MoneyError(`split() requires a positive integer, received ${parts}`);
    }
    return this.allocate(Array.from({ length: parts }, () => 1n));
  }

  // -------------------------------------------------------------------------
  // Comparison
  // -------------------------------------------------------------------------

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amountMinor < other.amountMinor) return -1;
    if (this.amountMinor > other.amountMinor) return 1;
    return 0;
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) === 1;
  }
  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }
  lessThan(other: Money): boolean {
    return this.compare(other) === -1;
  }
  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  get isZero(): boolean {
    return this.amountMinor === 0n;
  }
  get isPositive(): boolean {
    return this.amountMinor > 0n;
  }
  get isNegative(): boolean {
    return this.amountMinor < 0n;
  }

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  static sum(values: readonly Money[], currency?: CurrencyCode): Money {
    if (values.length === 0) {
      if (!currency) {
        throw new MoneyError('Money.sum() of an empty list requires an explicit currency');
      }
      return Money.zero(currency);
    }
    return values.reduce((acc, v) => acc.add(v));
  }

  // -------------------------------------------------------------------------
  // Serialisation
  // -------------------------------------------------------------------------

  /** Major-unit decimal string — exact, no float involved. For display/export. */
  toMajorString(): string {
    const exponent = currencyMeta(this.currency).exponent;
    const negative = this.amountMinor < 0n;
    const abs = (negative ? -this.amountMinor : this.amountMinor).toString();

    if (exponent === 0) return `${negative ? '-' : ''}${abs}`;

    const padded = abs.padStart(exponent + 1, '0');
    const whole = padded.slice(0, -exponent);
    const fraction = padded.slice(-exponent);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  format(locale = 'en-IN'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: currencyMeta(this.currency).exponent,
    }).format(Number(this.toMajorString()));
  }

  /**
   * Wire/DB shape. `amountMinor` is a **string**: JSON has no bigint, and
   * `JSON.stringify` on a bigint throws. Emitting a number would reintroduce
   * the precision loss this class exists to prevent.
   */
  toJSON(): { amountMinor: string; currency: CurrencyCode; formatted: string } {
    return {
      amountMinor: this.amountMinor.toString(),
      currency: this.currency,
      formatted: this.toMajorString(),
    };
  }

  toString(): string {
    return `${this.currency} ${this.toMajorString()}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(
        `Currency mismatch: cannot combine ${this.currency} with ${other.currency}. ` +
          `Convert explicitly through an exchange rate first.`,
      );
    }
  }
}
