import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { CryptoConfig } from '../../config/configuration';

/**
 * Password hashing.
 *
 * bcrypt at cost 12 per the build spec. The stored hash is self-describing
 * (`$2b$…` vs `$argon2id$…`), and `needsRehash` reports when a hash is below the
 * current cost — so raising the cost factor, or migrating to argon2id, can happen
 * transparently on next successful login rather than requiring a password reset
 * for every user.
 *
 * bcrypt's own 72-byte input limit is handled explicitly below; silently
 * truncating a long passphrase is a real (and well-documented) source of
 * "my password works on one site but not another" bugs.
 */
@Injectable()
export class HashService {
  private readonly logger = new Logger(HashService.name);
  private readonly rounds: number;

  /** bcrypt ignores everything past 72 bytes of input. */
  private static readonly BCRYPT_MAX_BYTES = 72;

  constructor(configService: ConfigService) {
    this.rounds = configService.getOrThrow<CryptoConfig>('crypto').bcryptRounds;
  }

  async hash(password: string): Promise<string> {
    this.assertWithinBcryptLimit(password);
    return bcrypt.hash(password, this.rounds);
  }

  /**
   * Verifies a password.
   *
   * Returns false rather than throwing on a malformed hash: a corrupt row must fail
   * the login, not 500 the endpoint (which would tell an attacker that the account
   * exists and is in an unusual state).
   */
  async verify(password: string, hash: string | null): Promise<boolean> {
    if (!hash) {
      // SSO-only account with no password. Still burn a comparison so the response
      // time matches a real failure — otherwise timing reveals which accounts have
      // passwords.
      await this.dummyCompare();
      return false;
    }

    try {
      return await bcrypt.compare(password.slice(0, HashService.BCRYPT_MAX_BYTES), hash);
    } catch (error) {
      this.logger.error(
        `Password verification failed on a malformed hash: ${error instanceof Error ? error.message : ''}`,
      );
      return false;
    }
  }

  /**
   * Constant-ish work for a non-existent account.
   *
   * Without this, "no such user" returns in microseconds while a real user's failed
   * login takes ~250 ms of bcrypt — a timing oracle that turns login into an
   * account-enumeration endpoint regardless of how carefully the response body is
   * worded.
   */
  async dummyCompare(): Promise<void> {
    // A fixed valid hash of a throwaway value; the comparison always fails.
    await bcrypt.compare(
      'dummy-password-for-timing-equalisation',
      '$2b$12$K8HkFvpFqLZ4tCTPKZ9YQeH1YXqZ1YXqZ1YXqZ1YXqZ1YXqZ1YXqZ',
    ).catch(() => false);
  }

  /** True when the hash was produced with a weaker cost than currently configured. */
  needsRehash(hash: string): boolean {
    try {
      return bcrypt.getRounds(hash) < this.rounds;
    } catch {
      // Unparseable, or a different algorithm entirely — either way it should be
      // replaced on next successful login.
      return true;
    }
  }

  private assertWithinBcryptLimit(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > HashService.BCRYPT_MAX_BYTES) {
      // Rejected rather than truncated. Truncating means a 100-character passphrase
      // and its first 72 characters both unlock the account, silently.
      throw new Error(
        `Password exceeds bcrypt's ${HashService.BCRYPT_MAX_BYTES}-byte limit; ` +
          `it would be silently truncated`,
      );
    }
  }
}
