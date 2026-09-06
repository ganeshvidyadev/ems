import { createHash, sign as cryptoSign, type KeyObject } from 'node:crypto';

/** RSA public JWK — the only member shape this client produces (account + certificate keys are both RSA). */
export interface RsaJwk {
  kty: 'RSA';
  n: string;
  e: string;
}

export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

export function base64urlJson(value: unknown): string {
  return base64url(Buffer.from(JSON.stringify(value), 'utf8'));
}

/** The public half of an RSA `KeyObject`, as an ACME/JOSE-shaped JWK (`n`/`e` only — no private members). */
export function publicJwk(key: KeyObject): RsaJwk {
  const jwk = key.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
  if (jwk.kty !== 'RSA') throw new Error(`Expected an RSA key, got kty=${jwk.kty}`);
  return { kty: 'RSA', n: jwk.n, e: jwk.e };
}

/**
 * RFC 7638 JWK thumbprint — SHA-256 over the JWK's *required* members only,
 * lexicographically ordered, with no insignificant whitespace. This exact
 * value (base64url-encoded) is what DNS-01's `keyAuthorization` is built
 * from, so member order and omission of optional fields both matter.
 */
export function jwkThumbprint(jwk: RsaJwk): string {
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return base64url(createHash('sha256').update(canonical, 'utf8').digest());
}

/**
 * Flattened-JSON-serialization JWS (RFC 7515), RS256 only — everything ACME
 * (RFC 8555 §6.2) requires: either `jwk` (account creation) or `kid` (every
 * later request) in the protected header, never both.
 */
export function signJws(params: {
  protectedHeader: Record<string, unknown>;
  payload: Record<string, unknown> | '';
  privateKey: KeyObject;
}): { protected: string; payload: string; signature: string } {
  const protectedB64 = base64urlJson(params.protectedHeader);
  const payloadB64 = params.payload === '' ? '' : base64urlJson(params.payload);
  const signingInput = Buffer.from(`${protectedB64}.${payloadB64}`, 'ascii');
  const signature = cryptoSign('sha256', signingInput, params.privateKey);

  return { protected: protectedB64, payload: payloadB64, signature: base64url(signature) };
}
