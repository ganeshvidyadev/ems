/**
 * A minimal, purpose-built DER/ASN.1 encoder — just enough to build a
 * PKCS#10 certificate signing request by hand. Node's `crypto` has no CSR
 * API, and no ASN.1 library is available in this environment (pnpm cannot
 * add dependencies here), so this covers exactly the constructs a CSR
 * needs: SEQUENCE, SET, INTEGER, OID, NULL, BIT STRING, UTF8String,
 * OCTET STRING, IA5String, and context-specific constructed tags.
 *
 * Not a general ASN.1 toolkit — e.g. `length` only handles definite short-
 * and long-form encoding up to 4 length bytes, which is far beyond anything
 * a CSR (a few KB at most) will ever need.
 */

const TAG = {
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30,
  SET: 0x31,
  IA5_STRING: 0x16,
  CONTEXT_0_CONSTRUCTED: 0xa0,
} as const;

function length(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  if (bytes.length > 4) throw new Error('DER length too large to encode');
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(content.length), content]);
}

export function derSequence(...children: Buffer[]): Buffer {
  return tlv(TAG.SEQUENCE, Buffer.concat(children));
}

export function derSet(...children: Buffer[]): Buffer {
  return tlv(TAG.SET, Buffer.concat(children));
}

export function derInteger(value: number): Buffer {
  if (value < 0 || !Number.isInteger(value)) throw new Error('derInteger only supports non-negative integers');
  if (value === 0) return tlv(TAG.INTEGER, Buffer.from([0x00]));
  const bytes: number[] = [];
  let n = value;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  // A high bit on the leading byte would read as negative in two's-complement DER.
  if (bytes[0]! & 0x80) bytes.unshift(0x00);
  return tlv(TAG.INTEGER, Buffer.from(bytes));
}

export function derNull(): Buffer {
  return Buffer.from([TAG.NULL, 0x00]);
}

/** `oid` as dotted decimal, e.g. "1.2.840.113549.1.1.11". */
export function derOid(oid: string): Buffer {
  const arcs = oid.split('.').map(Number);
  if (arcs.length < 2) throw new Error(`Invalid OID: ${oid}`);

  const bytes: number[] = [40 * arcs[0]! + arcs[1]!];
  for (const arc of arcs.slice(2)) {
    if (arc === 0) {
      bytes.push(0);
      continue;
    }
    const base128: number[] = [];
    let n = arc;
    while (n > 0) {
      base128.unshift(n & 0x7f);
      n >>= 7;
    }
    for (let i = 0; i < base128.length - 1; i++) base128[i] = base128[i]! | 0x80;
    bytes.push(...base128);
  }
  return tlv(TAG.OID, Buffer.from(bytes));
}

export function derBitString(content: Buffer, unusedBits = 0): Buffer {
  return tlv(TAG.BIT_STRING, Buffer.concat([Buffer.from([unusedBits]), content]));
}

export function derOctetString(content: Buffer): Buffer {
  return tlv(TAG.OCTET_STRING, content);
}

export function derUtf8String(value: string): Buffer {
  return tlv(TAG.UTF8_STRING, Buffer.from(value, 'utf8'));
}

export function derIa5String(value: string): Buffer {
  return tlv(TAG.IA5_STRING, Buffer.from(value, 'ascii'));
}

/** `[0]` constructed — used for CertificationRequestInfo's implicitly-tagged `attributes` field. */
export function derContext0(...children: Buffer[]): Buffer {
  return tlv(TAG.CONTEXT_0_CONSTRUCTED, Buffer.concat(children));
}

/** `[2]` primitive (dNSName) inside a GeneralName CHOICE — implicit IA5String. */
export function derContextPrimitive(tagNumber: number, content: Buffer): Buffer {
  return tlv(0x80 | tagNumber, content);
}
