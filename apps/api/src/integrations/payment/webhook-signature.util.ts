import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time hex comparison, shared by every gateway adapter's webhook and
 * callback verification.
 *
 * `===` on a signature leaks its prefix through timing, which is enough to
 * forge one byte at a time given enough attempts. Length is compared first
 * because `timingSafeEqual` throws on a mismatch — and the length itself is
 * not the secret.
 */
export function safeEqualHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

/** Same, for base64-encoded signatures (Cashfree, some PayPal fields). */
export function safeEqualBase64(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(provided, 'base64'));
  } catch {
    return false;
  }
}
