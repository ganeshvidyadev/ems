import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { CryptoConfig } from '../../config/configuration';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — the GCM standard; other lengths weaken the mode.
const AUTH_TAG_LENGTH = 16;

/**
 * Application-layer field encryption and hashing.
 *
 * AES-256-**GCM**, not CBC: GCM is authenticated, so tampering with a stored
 * ciphertext produces a decryption failure rather than silently different
 * plaintext. For a TOTP secret or a webhook signing key, an attacker who can
 * modify a database value without detection can do real damage.
 *
 * Output layout is `iv || authTag || ciphertext` in one buffer, stored in a
 * `VARBINARY` column. Keeping them together means a row can never be
 * half-migrated into an undecryptable state.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<CryptoConfig>('crypto');
    this.key = config.encryptionKey;

    if (this.key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes for AES-256, got ${this.key.length}`,
      );
    }
  }

  /** Encrypts to `iv || authTag || ciphertext`. A fresh random IV every call. */
  encrypt(plaintext: string): Buffer {
    // Never reuse an IV with the same key: under GCM, IV reuse leaks the
    // authentication key and lets an attacker forge ciphertexts.
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(payload: Buffer): string {
    if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Ciphertext is too short to contain an IV and auth tag');
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    // Throws on tampering — `final()` verifies the tag.
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /**
   * SHA-256 for high-entropy server-generated secrets (refresh tokens, API keys).
   *
   * Correct here precisely because these are not passwords: there is no dictionary
   * to attack 256 bits of randomness, so a slow hash would buy nothing and would
   * add its cost to every single API call.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Cryptographically random, URL-safe token. */
  generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Numeric OTP with uniform distribution. */
  generateNumericCode(digits = 6): string {
    const max = 10 ** digits;
    // Rejection sampling: `randomInt % max` would bias the low values, and a
    // biased OTP is measurably easier to guess.
    let value: number;
    do {
      value = randomBytes(4).readUInt32BE(0);
    } while (value >= Math.floor(0xffffffff / max) * max);

    return String(value % max).padStart(digits, '0');
  }

  /**
   * Constant-time comparison.
   *
   * `===` on a token leaks its prefix through timing, which is enough to recover a
   * secret byte by byte given enough attempts. Lengths are compared first because
   * `timingSafeEqual` throws on a mismatch — and length is not the secret.
   */
  safeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  /** HMAC-SHA256 hex digest — inbound and outbound webhook signatures. */
  hmac(payload: string | Buffer, secret: string): string {
    return createHash('sha256')
      .update(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload)
      .update(Buffer.from(secret, 'utf8'))
      .digest('hex');
  }
}
