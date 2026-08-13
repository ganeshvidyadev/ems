/**
 * Currency metadata, keyed by ISO-4217 alpha code.
 *
 * `exponent` is the number of decimal places in the minor unit. It is not
 * always 2: JPY has none, KWD/BHD/OMR have three. Hardcoding 100 as the
 * major→minor factor is the single most common currency bug, and it silently
 * inflates a JPY amount by 100× or truncates a KWD amount by 10×.
 */
export interface CurrencyMeta {
  readonly code: string;
  readonly numericCode: number;
  readonly exponent: number;
  readonly symbol: string;
  readonly name: string;
}

const CURRENCY_TABLE = {
  INR: { code: 'INR', numericCode: 356, exponent: 2, symbol: '₹', name: 'Indian Rupee' },
  USD: { code: 'USD', numericCode: 840, exponent: 2, symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', numericCode: 978, exponent: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', numericCode: 826, exponent: 2, symbol: '£', name: 'Pound Sterling' },
  AED: { code: 'AED', numericCode: 784, exponent: 2, symbol: 'د.إ', name: 'UAE Dirham' },
  SGD: { code: 'SGD', numericCode: 702, exponent: 2, symbol: 'S$', name: 'Singapore Dollar' },
  AUD: { code: 'AUD', numericCode: 36, exponent: 2, symbol: 'A$', name: 'Australian Dollar' },
  CAD: { code: 'CAD', numericCode: 124, exponent: 2, symbol: 'C$', name: 'Canadian Dollar' },
  // Zero-decimal currency: 1 JPY is already the minor unit.
  JPY: { code: 'JPY', numericCode: 392, exponent: 0, symbol: '¥', name: 'Japanese Yen' },
  // Three-decimal currency: 1 KWD = 1000 fils.
  KWD: { code: 'KWD', numericCode: 414, exponent: 3, symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  BHD: { code: 'BHD', numericCode: 48, exponent: 3, symbol: '.د.ب', name: 'Bahraini Dinar' },
} as const satisfies Record<string, CurrencyMeta>;

export type CurrencyCode = keyof typeof CURRENCY_TABLE;

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_TABLE) as CurrencyCode[];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCY_TABLE;
}

export function currencyMeta(code: CurrencyCode): CurrencyMeta {
  return CURRENCY_TABLE[code];
}

/** 10 ** exponent, as a bigint — the major↔minor conversion factor. */
export function minorUnitFactor(code: CurrencyCode): bigint {
  return 10n ** BigInt(CURRENCY_TABLE[code].exponent);
}
