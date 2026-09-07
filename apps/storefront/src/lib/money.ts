import type { MoneyDto } from '@ems/contracts';
import { Money, isCurrencyCode } from '@ems/kernel';

/**
 * Price display, delegated to the kernel's `Money`.
 *
 * Deliberately not a local formatter: the exponent is per currency (JPY has no
 * minor unit, KWD has three), so "divide by 100 and show two decimals" is wrong
 * for a real currency table. `Money` already owns that table, and the console app
 * having hand-rolled its own copy is a duplication worth not repeating here.
 *
 * These wrappers exist only to absorb one impedance mismatch: the API types the
 * currency as a bare `string`, while `Money.fromMinor` demands a `CurrencyCode`
 * and *throws* on anything else. A price is not worth crashing a product page
 * over, so an unknown code degrades to a readable "1234 XYZ" instead.
 */

const DEFAULT_LOCALE = 'en-IN';

export function formatMinor(amountMinor: string | number | bigint, currency: string, locale = DEFAULT_LOCALE): string {
  if (!isCurrencyCode(currency)) return `${String(amountMinor)} ${currency}`;

  try {
    return Money.fromMinor(amountMinor, currency).format(locale);
  } catch {
    return `${String(amountMinor)} ${currency}`;
  }
}

/** For the `{ amountMinor, currency }` shape the cart and checkout endpoints return. */
export function formatMoney(money: MoneyDto, locale = DEFAULT_LOCALE): string {
  return formatMinor(money.amountMinor, money.currency, locale);
}

/** True when a money value is a non-zero amount — used to hide empty discount rows. */
export function isNonZero(money: MoneyDto | undefined | null): boolean {
  if (!money) return false;
  return /[1-9]/.test(money.amountMinor);
}

/**
 * Percent saved against a compare-at price, or null when there is no genuine
 * saving. Returning null rather than 0 lets the caller drop the badge entirely.
 */
export function discountPercent(priceMinor: string, comparePriceMinor: string | null): number | null {
  if (!comparePriceMinor) return null;

  const price = Number(priceMinor);
  const compare = Number(comparePriceMinor);
  if (!Number.isFinite(price) || !Number.isFinite(compare) || compare <= price || compare <= 0) {
    return null;
  }

  return Math.round(((compare - price) / compare) * 100);
}
