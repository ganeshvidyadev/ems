import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, resolving Tailwind conflicts.
 *
 * `twMerge` and not plain concatenation: with `clsx` alone, `cn('p-2', 'p-4')`
 * emits both and the winner depends on stylesheet order — so a component's prop
 * override silently fails. `twMerge` keeps the last conflicting utility.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a `Money` wire value.
 *
 * `amountMinor` arrives as a **string** (JSON has no bigint), and the currency's
 * exponent is not always 2 — JPY has none, KWD has three. Dividing by a hardcoded
 * 100 would inflate a yen amount 100× and truncate a dinar.
 */
export function formatMoney(
  money: { amountMinor: string; currency: string } | null | undefined,
  locale = 'en-IN',
): string {
  if (!money) return '—';

  const exponent = minorUnitExponent(money.currency);
  const negative = money.amountMinor.startsWith('-');
  const digits = negative ? money.amountMinor.slice(1) : money.amountMinor;

  const padded = digits.padStart(exponent + 1, '0');
  const whole = exponent === 0 ? padded : padded.slice(0, -exponent);
  const fraction = exponent === 0 ? '' : padded.slice(-exponent);
  const major = `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: exponent,
  }).format(Number(major));
}

function minorUnitExponent(currency: string): number {
  if (currency === 'JPY' || currency === 'KRW') return 0;
  if (currency === 'KWD' || currency === 'BHD' || currency === 'OMR') return 3;
  return 2;
}

export function formatDate(value: string | Date | null | undefined, locale = 'en-IN'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}
