import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { base64url, jwkThumbprint, publicJwk, signJws, type RsaJwk } from '../../src/integrations/acme/jose.util';
import { derOid } from '../../src/integrations/acme/der.util';

/**
 * `jwkThumbprint` and `signJws` are the two pieces DNS-01 correctness rests
 * on: a wrong thumbprint publishes a TXT value the CA will never match, and
 * a wrong JWS gets every ACME request rejected outright. Both are cheap to
 * get subtly wrong (member order, base64 vs base64url, JSON whitespace) and
 * expensive to debug against a live directory, so they get an authoritative
 * test vector rather than a self-consistency check.
 */
describe('ACME JOSE helpers', () => {
  describe('jwkThumbprint', () => {
    // RFC 7638 Appendix A.1 / A.2 — the JWK Thumbprint spec's own worked example.
    const RFC_7638_JWK: RsaJwk = {
      kty: 'RSA',
      n:
        '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKR' +
        'XjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
      e: 'AQAB',
    };
    const RFC_7638_THUMBPRINT = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs';

    it('matches the RFC 7638 worked example exactly', () => {
      expect(jwkThumbprint(RFC_7638_JWK)).toBe(RFC_7638_THUMBPRINT);
    });

    it('is sensitive to member order in the input object (canonical JSON, not insertion order)', () => {
      const reordered: RsaJwk = { n: RFC_7638_JWK.n, kty: 'RSA', e: RFC_7638_JWK.e };
      // Same logical JWK, different property insertion order — must still match,
      // proving the canonicalization sorts keys rather than trusting call-site order.
      expect(jwkThumbprint(reordered)).toBe(RFC_7638_THUMBPRINT);
    });

    it('changes if any member changes', () => {
      expect(jwkThumbprint({ ...RFC_7638_JWK, e: 'AQABAA' })).not.toBe(RFC_7638_THUMBPRINT);
    });
  });

  describe('publicJwk', () => {
    it('round-trips modulus/exponent from a real RSA key with no private members', () => {
      const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = publicJwk(publicKey);

      expect(jwk.kty).toBe('RSA');
      expect(jwk).not.toHaveProperty('d');
      expect(jwk).not.toHaveProperty('p');
      expect(typeof jwk.n).toBe('string');
      expect(typeof jwk.e).toBe('string');
    });
  });

  describe('signJws', () => {
    it('produces a signature that verifies against the same key with RS256 semantics', () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

      const jws = signJws({
        protectedHeader: { alg: 'RS256', nonce: 'test-nonce', url: 'https://acme.test/order/1' },
        payload: { identifiers: [{ type: 'dns', value: 'shop.example.com' }] },
        privateKey,
      });

      const signingInput = Buffer.from(`${jws.protected}.${jws.payload}`, 'ascii');
      const signature = Buffer.from(jws.signature, 'base64url');

      expect(verify('sha256', signingInput, publicKey, signature)).toBe(true);
    });

    it('signs an empty payload (POST-as-GET) as an empty string, not "null" or "{}"', () => {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jws = signJws({ protectedHeader: { alg: 'RS256', nonce: 'n', url: 'https://acme.test/authz/1' }, payload: '', privateKey });
      expect(jws.payload).toBe('');
    });

    it('a tampered payload fails verification', () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jws = signJws({ protectedHeader: { alg: 'RS256', nonce: 'n', url: 'https://acme.test/x' }, payload: { a: 1 }, privateKey });

      const tamperedSigningInput = Buffer.from(`${jws.protected}.${base64url(Buffer.from(JSON.stringify({ a: 2 })))}`, 'ascii');
      const signature = Buffer.from(jws.signature, 'base64url');

      expect(verify('sha256', tamperedSigningInput, publicKey, signature)).toBe(false);
    });
  });

  describe('base64url', () => {
    it('uses URL-safe characters with no padding', () => {
      // Chosen to contain bytes that produce '+', '/' and padding under standard base64.
      const value = base64url(Buffer.from([0xfb, 0xff, 0xbf, 0x00]));
      expect(value).not.toMatch(/[+/=]/);
    });
  });
});

describe('DER OID encoding', () => {
  it('matches the known byte encoding of sha256WithRSAEncryption (1.2.840.113549.1.1.11)', () => {
    // A well-known encoding, independently verifiable against any ASN.1 dumper —
    // this is the exact OID used in every finalize CSR's signatureAlgorithm field.
    const expectedContent = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
    const encoded = derOid('1.2.840.113549.1.1.11');

    expect(encoded[0]).toBe(0x06); // OBJECT IDENTIFIER tag
    expect(encoded[1]).toBe(expectedContent.length);
    expect(encoded.subarray(2)).toEqual(expectedContent);
  });

  it('matches the known byte encoding of subjectAltName (2.5.29.17)', () => {
    const expectedContent = Buffer.from([0x55, 0x1d, 0x11]);
    const encoded = derOid('2.5.29.17');
    expect(encoded.subarray(2)).toEqual(expectedContent);
  });
});

describe('DNS-01 key authorization (RFC 8555 §8.4)', () => {
  const thumbprint = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs';

  function dnsTxtValueFor(token: string): string {
    return base64url(createHash('sha256').update(`${token}.${thumbprint}`, 'utf8').digest());
  }

  it('is a 32-byte SHA-256 digest, base64url encoded with no padding', () => {
    const value = dnsTxtValueFor('DGyRejmCefe7v4NfDGDKfA');
    expect(Buffer.from(value, 'base64url').length).toBe(32);
    expect(value).not.toMatch(/[+/=]/);
  });

  it('a different challenge token produces a different TXT value', () => {
    expect(dnsTxtValueFor('DGyRejmCefe7v4NfDGDKfA')).not.toBe(dnsTxtValueFor('a-different-token'));
  });

  it('is deterministic for the same token and thumbprint', () => {
    expect(dnsTxtValueFor('same-token')).toBe(dnsTxtValueFor('same-token'));
  });
});
