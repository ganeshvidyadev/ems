/**
 * Redaction for anything bound for a log store.
 *
 * The API logs every request body, which means it will log password-reset
 * payloads, card tokens and `Authorization` headers unless something stops it.
 * A log database is backed up, replicated, and readable by more people than the
 * primary store, so a secret that reaches it should be treated as leaked.
 *
 * Matching is on **key name substring**, deliberately over-broad: a false positive
 * costs a redacted field in a debug log, a false negative costs a credential.
 */

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'auth',
  'cookie',
  'session',
  'apikey',
  'api_key',
  'accesskey',
  'privatekey',
  'signature',
  'otp',
  'pin',
  'cvv',
  'cvc',
  'card',
  'cardnumber',
  'pan',
  'expiry',
  'ssn',
  'aadhaar',
  'pancard',
  'taxid',
  'bankaccount',
  'accountnumber',
  'ifsc',
  'routing',
  'upi',
  'mfa',
  'totp',
  'recoverycode',
  'refreshtoken',
  'clientsecret',
  'webhooksecret',
  'encryptionkey',
] as const;

export const REDACTED = '[REDACTED]';

/** Headers echoed verbatim; everything else is redacted or dropped. */
const SAFE_HEADERS = new Set([
  'host',
  'user-agent',
  'accept',
  'accept-language',
  'accept-encoding',
  'content-type',
  'content-length',
  'referer',
  'origin',
  'x-correlation-id',
  'x-forwarded-for',
  'x-real-ip',
  'x-request-id',
  'if-none-match',
  'cache-control',
]);

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Deep-clones with sensitive values replaced.
 *
 * `depth` is capped and cycles are broken, because a log writer must never be the
 * thing that hangs or OOMs the process — a deeply nested or self-referential
 * payload is otherwise a denial-of-service against our own logging.
 */
export function redact(value: unknown, maxDepth = 8, seen = new WeakSet<object>()): unknown {
  return redactAt(value, 0, maxDepth, seen);
}

function redactAt(value: unknown, depth: number, maxDepth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return `${value.toString()}n`;
  if (type === 'function' || type === 'symbol') return undefined;

  if (depth >= maxDepth) return '[TRUNCATED_DEPTH]';

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}b]`;

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);

    if (Array.isArray(value)) {
      // Cap array length: a 50k-row bulk import body must not become a 50k-entry
      // log document.
      const capped = value.slice(0, 50);
      const out = capped.map((item) => redactAt(item, depth + 1, maxDepth, seen));
      if (value.length > capped.length) out.push(`[+${value.length - capped.length} more]`);
      return out;
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redactAt(item, depth + 1, maxDepth, seen);
    }
    return result;
  }

  return undefined;
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SAFE_HEADERS.has(lower)) result[lower] = value;
    else if (isSensitiveKey(lower)) result[lower] = REDACTED;
    // Unknown, non-sensitive headers are dropped rather than kept: they are
    // rarely useful and they are where surprising PII shows up.
  }
  return result;
}

/**
 * Serialises with a byte cap so one large payload cannot dominate the collection.
 * Returns the (possibly truncated) value plus the original byte size, because
 * knowing a body was 4 MB is itself diagnostic.
 */
export function truncateForLog(
  value: unknown,
  maxBytes = 8_192,
): { value: unknown; size: number; truncated: boolean } {
  if (value === undefined || value === null) return { value, size: 0, truncated: false };

  let serialised: string;
  try {
    serialised = JSON.stringify(value) ?? '';
  } catch {
    return { value: '[UNSERIALIZABLE]', size: 0, truncated: false };
  }

  const size = Buffer.byteLength(serialised, 'utf8');
  if (size <= maxBytes) return { value, size, truncated: false };

  return {
    value: `${serialised.slice(0, maxBytes)}…[truncated ${size - maxBytes}b]`,
    size,
    truncated: true,
  };
}
