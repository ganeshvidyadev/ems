import { generateKeyPairSync, verify } from 'node:crypto';
import { assertAsciiHostname, buildCertificateSigningRequestDer } from '../../src/integrations/acme/csr.util';

/**
 * There is no ASN.1 library in this environment to decode the CSR against
 * for a black-box check, so this test hand-parses just enough of the DER
 * (SEQUENCE/BIT STRING lengths) to split the CSR into
 * `certificationRequestInfo` and its signature, then verifies that
 * signature independently with Node's own `crypto.verify`. A CSR Let's
 * Encrypt would reject (wrong signature, malformed ASN.1, missing SAN) is
 * exactly what this catches — the hand-rolled DER encoder in `der.util.ts`
 * has no other check on it.
 */
describe('buildCertificateSigningRequestDer', () => {
  function readLength(buf: Buffer, offset: number): { length: number; next: number } {
    const first = buf[offset]!;
    if ((first & 0x80) === 0) return { length: first, next: offset + 1 };
    const numBytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) length = (length << 8) | buf[offset + 1 + i]!;
    return { length, next: offset + 1 + numBytes };
  }

  /** Splits a top-level `SEQUENCE { certificationRequestInfo, sigAlg, BIT STRING signature }`. */
  function splitCsr(der: Buffer): { requestInfo: Buffer; signature: Buffer } {
    expect(der[0]).toBe(0x30); // outer SEQUENCE
    const outer = readLength(der, 1);

    expect(der[outer.next]).toBe(0x30); // certificationRequestInfo SEQUENCE
    const info = readLength(der, outer.next + 1);
    const requestInfo = der.subarray(outer.next, info.next + info.length);

    let cursor = info.next + info.length;
    expect(der[cursor]).toBe(0x30); // signatureAlgorithm SEQUENCE
    const sigAlg = readLength(der, cursor + 1);
    cursor = sigAlg.next + sigAlg.length;

    expect(der[cursor]).toBe(0x03); // BIT STRING (signature)
    const sig = readLength(der, cursor + 1);
    const bitStringContent = der.subarray(sig.next, sig.next + sig.length);
    const unusedBits = bitStringContent[0]!;
    expect(unusedBits).toBe(0);
    const signature = bitStringContent.subarray(1);

    return { requestInfo, signature };
  }

  it('produces a CSR whose embedded signature verifies against its own certificationRequestInfo', () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = buildCertificateSigningRequestDer(['shop.example.com'], keyPair);

    const { requestInfo, signature } = splitCsr(der);
    expect(verify('sha256', requestInfo, keyPair.publicKey, signature)).toBe(true);
  });

  it('embeds every hostname as a dNSName in the subjectAltName extension', () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = buildCertificateSigningRequestDer(['shop.example.com', 'www.shop.example.com'], keyPair);

    // The SAN extension is built from IA5String dNSName entries (ASCII), so both
    // hostnames must appear verbatim as byte sequences somewhere in the DER —
    // a cheap but real check that the SAN loop iterated every identifier, not just
    // the first (which is what a `hostnames[0]`-only bug would still pass CN-wise).
    expect(der.includes(Buffer.from('shop.example.com', 'ascii'))).toBe(true);
    expect(der.includes(Buffer.from('www.shop.example.com', 'ascii'))).toBe(true);
  });

  it('a signature check fails if the CSR is tampered with', () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = buildCertificateSigningRequestDer(['shop.example.com'], keyPair);
    const tampered = Buffer.from(der);
    tampered[tampered.length - 1] ^= 0xff; // flip a bit inside the signature bytes

    const { requestInfo, signature } = splitCsr(tampered);
    expect(verify('sha256', requestInfo, keyPair.publicKey, signature)).toBe(false);
  });

  it('rejects an empty hostname list', () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() => buildCertificateSigningRequestDer([], keyPair)).toThrow();
  });
});

describe('assertAsciiHostname', () => {
  it('accepts ordinary ASCII hostnames', () => {
    expect(() => assertAsciiHostname('shop.example.com')).not.toThrow();
    expect(() => assertAsciiHostname('a.b-c.example.co.in')).not.toThrow();
  });

  it('rejects a hostname with non-ASCII characters (IDN must be punycoded first)', () => {
    expect(() => assertAsciiHostname('café.example.com')).toThrow();
  });

  it('rejects a bare label with no dot', () => {
    expect(() => assertAsciiHostname('localhost')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => assertAsciiHostname('')).toThrow();
  });
});
