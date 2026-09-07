/**
 * Rupee-decimal input → minor-units wire string, the inverse of
 * `formatMoney` in `utils.ts`. Product/price forms let a merchant type
 * "199.99", never "19999" — the backend's own `minorAmountSchema` only
 * accepts the latter, so every form that collects a price converts here
 * before submit.
 *
 * INR/2-decimal only, matching every form this is currently used from —
 * `formatMoney`'s own per-currency exponent table is the thing to reach for
 * if a form ever needs to collect a JPY/KWD price.
 */
export function rupeesToMinorString(input: string): string {
  const trimmed = input.trim();
  const negative = trimmed.startsWith('-');
  const [wholePart, fractionPart = ''] = (negative ? trimmed.slice(1) : trimmed).split('.');
  const fraction = (fractionPart + '00').slice(0, 2);
  const minor = `${wholePart || '0'}${fraction}`.replace(/^0+(?=\d)/, '');
  return negative ? `-${minor}` : minor;
}

export function minorStringToRupees(minor: string): string {
  const negative = minor.startsWith('-');
  const digits = negative ? minor.slice(1) : minor;
  const padded = digits.padStart(3, '0');
  const whole = padded.slice(0, -2);
  const fraction = padded.slice(-2);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
