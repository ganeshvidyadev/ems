import { sign, type KeyObject } from 'node:crypto';
import {
  derBitString,
  derContext0,
  derContextPrimitive,
  derIa5String,
  derInteger,
  derNull,
  derOctetString,
  derOid,
  derSequence,
  derSet,
  derUtf8String,
} from './der.util';

const OID_COMMON_NAME = '2.5.4.3';
const OID_SUBJECT_ALT_NAME = '2.5.29.17';
const OID_EXTENSION_REQUEST = '1.2.840.113549.1.9.14';
const OID_SHA256_WITH_RSA = '1.2.840.113549.1.1.11';

/**
 * Builds a PKCS#10 certificate signing request (RFC 2986) with a
 * `subjectAltName` extension listing every requested hostname — required
 * because RFC 8555 §7.4 rejects a CSR whose SAN set doesn't exactly match
 * the order's identifiers; a bare `commonName` is not sufficient.
 *
 * Returns raw DER, which is what ACME's `finalize` endpoint wants
 * (base64url-encoded, no PEM headers) — see RFC 8555 §7.4.
 */
export function buildCertificateSigningRequestDer(hostnames: string[], keyPair: { publicKey: KeyObject; privateKey: KeyObject }): Buffer {
  if (hostnames.length === 0) throw new Error('A CSR needs at least one hostname');

  const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });

  const subject = derSequence(
    derSet(derSequence(derOid(OID_COMMON_NAME), derUtf8String(hostnames[0]!))),
  );

  const generalNames = derSequence(...hostnames.map((h) => derContextPrimitive(2, Buffer.from(h, 'ascii'))));
  const sanExtension = derSequence(derOid(OID_SUBJECT_ALT_NAME), derOctetString(generalNames));
  const extensions = derSequence(sanExtension);
  const extensionRequestAttribute = derSequence(derOid(OID_EXTENSION_REQUEST), derSet(extensions));
  const attributes = derContext0(extensionRequestAttribute);

  const certificationRequestInfo = derSequence(
    derInteger(0),
    subject,
    spkiDer as Buffer,
    attributes,
  );

  const signatureAlgorithm = derSequence(derOid(OID_SHA256_WITH_RSA), derNull());
  const signature = sign('sha256', certificationRequestInfo, keyPair.privateKey);

  return derSequence(certificationRequestInfo, signatureAlgorithm, derBitString(signature));
}

/** IA5String IS ASCII-only — reject anything a real hostname (post-punycode) can't be. */
export function assertAsciiHostname(hostname: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(hostname)) {
    throw new Error(`Not a valid ASCII hostname for a CSR SAN entry: ${hostname}`);
  }
}
