import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError, ValidationError } from '@ems/kernel';
import { ErrorCode } from '@ems/contracts';
import { InjectDataSource } from '@nestjs/typeorm';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../../database/entities';
import { CryptoService } from '../../../common/services/crypto.service';
import { HashService } from '../../../common/services/hash.service';
import type { AppConfig } from '../../../config/configuration';
import { AuthLogService } from './auth-log.service';
import { RefreshTokenService } from './refresh-token.service';

const RECOVERY_CODE_COUNT = 10;

class MfaInvalidCodeError extends DomainError {
  readonly code = ErrorCode.AUTH_MFA_INVALID_CODE;
}

export interface MfaEnrolment {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
}

/**
 * TOTP two-factor authentication (RFC 6238).
 *
 * Enrolment is deliberately **two-phase**: `beginEnrolment` stores an encrypted secret
 * but leaves `mfa_confirmed_at` NULL, and only `confirmEnrolment` — after the user has
 * proved they can generate a valid code — flips it on. Enabling MFA the moment a QR is
 * displayed is how users lock themselves out of their own accounts after a failed scan.
 *
 * `authenticator.check` accepts the adjacent time windows, which covers ordinary clock
 * drift between the user's phone and our servers. Without that tolerance a correct code
 * is rejected for users whose device clock is a few seconds off — a support burden with
 * no security benefit, since the window is still tiny.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly app: AppConfig;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: CryptoService,
    private readonly hash: HashService,
    private readonly authLog: AuthLogService,
    private readonly refreshTokens: RefreshTokenService,
    configService: ConfigService,
  ) {
    this.app = configService.getOrThrow<AppConfig>('app');

    authenticator.options = {
      // ±1 step (±30s) either side of the current window.
      window: 1,
      step: 30,
      digits: 6,
    };
  }

  // -------------------------------------------------------------------------
  // Enrolment
  // -------------------------------------------------------------------------

  async beginEnrolment(userId: string): Promise<MfaEnrolment> {
    const user = await this.requireUser(userId);

    if (user.mfaEnabled && user.mfaConfirmedAt !== null) {
      throw new ValidationError('Two-factor authentication is already enabled');
    }

    const secret = authenticator.generateSecret(20);
    const label = `${this.app.name}:${user.email}`;
    const otpauthUri = authenticator.keyuri(user.email, this.app.name, secret);

    // Encrypted at the application layer with AES-256-GCM: a database dump must not
    // yield working TOTP seeds, and GCM means a tampered ciphertext fails loudly rather
    // than decrypting to something different.
    await this.dataSource.query(
      `UPDATE users
          SET mfa_secret_encrypted = ?, mfa_enabled = 0, mfa_confirmed_at = NULL
        WHERE id = ?`,
      [this.crypto.encrypt(secret), userId],
    );

    return {
      secret,
      otpauthUri,
      // Data URL so the secret never travels through a third-party QR service.
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUri, { width: 240, margin: 1 }),
    };
  }

  /**
   * Confirms enrolment and returns recovery codes.
   *
   * Recovery codes are shown **once**. They are stored bcrypt-hashed, so we genuinely
   * cannot redisplay them — which is the point: a codes list retrievable from the
   * account it protects is not a recovery mechanism.
   */
  async confirmEnrolment(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.requireUser(userId);

    if (!user.mfaSecretEncrypted) {
      throw new ValidationError('Start two-factor setup before confirming it');
    }

    const secret = this.crypto.decrypt(user.mfaSecretEncrypted);
    if (!authenticator.check(code, secret)) {
      throw new MfaInvalidCodeError('That code is not valid. Check your authenticator app.');
    }

    // 16 bytes in, so that after stripping non-alphanumerics there are reliably ≥12
    // random characters to take. Generating fewer and zero-padding would produce codes
    // that *look* like 12 characters of entropy while carrying only 8 — and the padding
    // would be identical across every code, which is worse than a visibly shorter code.
    const plaintextCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      formatRecoveryCode(this.crypto.generateToken(16)),
    );
    const hashed = await Promise.all(
      plaintextCodes.map((recoveryCode) => this.hash.hash(normalizeRecoveryCode(recoveryCode))),
    );

    await this.dataSource.query(
      `UPDATE users
          SET mfa_enabled = 1, mfa_confirmed_at = NOW(3),
              mfa_recovery_codes = ?, mfa_recovery_codes_used = 0
        WHERE id = ?`,
      [JSON.stringify(hashed), userId],
    );

    this.authLog.record({ event: 'MFA_ENROLLED', userId, tenantId: user.tenantId });

    return { recoveryCodes: plaintextCodes };
  }

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  /** Verifies a TOTP code during login. */
  async verifyTotp(userId: string, code: string): Promise<boolean> {
    const user = await this.requireUser(userId);
    if (!user.mfaSecretEncrypted || user.mfaConfirmedAt === null) return false;

    const secret = this.crypto.decrypt(user.mfaSecretEncrypted);
    const valid = authenticator.check(code, secret);

    this.authLog.record({
      event: valid ? 'MFA_VERIFIED' : 'MFA_FAILED',
      userId,
      tenantId: user.tenantId,
      detail: { method: 'TOTP' },
    });

    return valid;
  }

  /**
   * Verifies and **consumes** a recovery code.
   *
   * Single-use is essential — a reusable recovery code is a permanent MFA bypass.
   * Consumption rewrites the stored array with the matching entry removed, inside a
   * transaction so two concurrent uses cannot both succeed.
   */
  async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(code);

    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT mfa_recovery_codes AS codes, tenant_id AS tenantId
           FROM users WHERE id = ? FOR UPDATE`,
        [userId],
      )) as { codes: string | string[] | null; tenantId: string | null }[];

      const row = rows[0];
      if (!row?.codes) return false;

      const hashes: string[] =
        typeof row.codes === 'string' ? (JSON.parse(row.codes) as string[]) : row.codes;

      let matchedIndex = -1;
      for (let index = 0; index < hashes.length; index++) {
        if (await this.hash.verify(normalized, hashes[index]!)) {
          matchedIndex = index;
          break;
        }
      }

      if (matchedIndex === -1) {
        this.authLog.record({
          event: 'MFA_FAILED',
          userId,
          tenantId: row.tenantId,
          detail: { method: 'RECOVERY_CODE' },
        });
        return false;
      }

      const remaining = hashes.filter((_, index) => index !== matchedIndex);
      await manager.query(
        `UPDATE users
            SET mfa_recovery_codes = ?, mfa_recovery_codes_used = mfa_recovery_codes_used + 1
          WHERE id = ?`,
        [JSON.stringify(remaining), userId],
      );

      // Elevated risk score: a recovery code being used usually means the user lost their
      // device — or that someone else has their codes.
      this.authLog.record({
        event: 'MFA_RECOVERY_CODE_USED',
        userId,
        tenantId: row.tenantId,
        detail: { remaining: remaining.length },
      });

      if (remaining.length <= 2) {
        this.logger.warn(`User ${userId} has only ${remaining.length} recovery codes left`);
      }

      return true;
    });
  }

  // -------------------------------------------------------------------------
  // Disable
  // -------------------------------------------------------------------------

  /**
   * Disables MFA. Requires **both** the password and a current code.
   *
   * Requiring only one would mean a stolen session could switch MFA off, which is the
   * first thing an attacker does. Requiring both means possession of the session alone
   * is not enough.
   *
   * All sessions are revoked afterwards, because the account's security posture just
   * changed and any session established under the old posture should be re-established.
   */
  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.requireUser(userId);

    const passwordValid = await this.hash.verify(password, user.passwordHash);
    if (!passwordValid) {
      throw new ValidationError('Password is incorrect', { field: 'password' });
    }

    const codeValid = await this.verifyTotp(userId, code);
    if (!codeValid) {
      throw new MfaInvalidCodeError('That code is not valid');
    }

    await this.dataSource.query(
      `UPDATE users
          SET mfa_enabled = 0, mfa_confirmed_at = NULL,
              mfa_secret_encrypted = NULL, mfa_recovery_codes = NULL,
              mfa_recovery_codes_used = 0
        WHERE id = ?`,
      [userId],
    );

    await this.refreshTokens.revokeAllForUser(userId, 'MFA_ENABLED');

    this.authLog.record({ event: 'MFA_DISABLED', userId, tenantId: user.tenantId });
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: userId } });
    if (!user) throw new ValidationError('User not found');
    return user;
  }
}

/**
 * `A1B2-C3D4-E5F6` — grouped in fours for legibility when copied off a screen.
 *
 * Throws rather than pads if the input is too short: silently padding would hide a
 * reduction in entropy behind a correct-looking code.
 */
function formatRecoveryCode(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleaned.length < 12) {
    throw new Error(
      `Recovery code source produced only ${cleaned.length} usable characters; need 12`,
    );
  }
  const code = cleaned.slice(0, 12);
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

/** Strips formatting so a user retyping without hyphens still matches. */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
