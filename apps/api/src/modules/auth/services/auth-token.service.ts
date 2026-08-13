import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthTokenPurpose } from '../../../database/entities';
import { CryptoService } from '../../../common/services/crypto.service';
import { RequestContextService } from '../../../common/services/request-context.service';

export interface IssuedAuthToken {
  /** Plaintext — goes into the email and nowhere else. */
  token: string;
  expiresAt: Date;
}

export interface ConsumedAuthToken {
  userId: string;
  tenantId: string | null;
  metadata: Record<string, unknown> | null;
}

/** Time-to-live per purpose. */
const TTL_SECONDS: Record<AuthTokenPurpose, number> = {
  // Generous: verification emails get buried and a user returning next morning
  // should not be stuck.
  EMAIL_VERIFICATION: 24 * 3_600,
  // Deliberately short. A reset link is an account takeover in an inbox, so the
  // window in which a leaked or forwarded email is dangerous must be small.
  PASSWORD_RESET: 3_600,
  EMAIL_CHANGE: 2 * 3_600,
  MFA_CHALLENGE: 300,
};

/**
 * Single-use link tokens (email verification, password reset).
 *
 * Only the SHA-256 is stored. SHA-256 rather than bcrypt is correct here: the value
 * is 32 bytes of CSPRNG output, so there is no dictionary to attack, and a slow hash
 * would only add latency to every click.
 */
@Injectable()
export class AuthTokenService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: CryptoService,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Issues a token, invalidating any outstanding one for the same user and purpose.
   *
   * The invalidation matters: without it, every "resend verification" click leaves
   * another live token, so an attacker who captured any earlier email keeps a working
   * link indefinitely. Requesting a new one should retire the old.
   */
  async issue(
    userId: string,
    tenantId: string | null,
    purpose: AuthTokenPurpose,
    identifier?: string,
    metadata?: Record<string, unknown>,
  ): Promise<IssuedAuthToken> {
    const plaintext = this.crypto.generateToken(32);
    const expiresAt = new Date(Date.now() + TTL_SECONDS[purpose] * 1_000);
    const ctx = this.context.get();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE auth_tokens
            SET invalidated_at = NOW(3)
          WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND invalidated_at IS NULL`,
        [userId, purpose],
      );

      await manager.query(
        `INSERT INTO auth_tokens
           (user_id, tenant_id, purpose, token_hash, identifier, metadata,
            expires_at, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, INET6_ATON(?), ?)`,
        [
          userId,
          tenantId,
          purpose,
          this.crypto.hashToken(plaintext),
          identifier ?? null,
          metadata ? JSON.stringify(metadata) : null,
          expiresAt,
          ctx?.ip ?? null,
          ctx?.userAgent?.slice(0, 500) ?? null,
        ],
      );
    });

    return { token: plaintext, expiresAt };
  }

  /**
   * Consumes a token, or returns null.
   *
   * A **conditional UPDATE**, not read-then-write. MySQL applies it atomically, so of
   * two concurrent clicks on the same reset link exactly one succeeds. A `SELECT`
   * followed by an `UPDATE` would let both through — and "single use" that holds only
   * under low concurrency is not single use.
   */
  async consume(plaintext: string, purpose: AuthTokenPurpose): Promise<ConsumedAuthToken | null> {
    const tokenHash = this.crypto.hashToken(plaintext);

    return this.dataSource.transaction(async (manager) => {
      const result = (await manager.query(
        `UPDATE auth_tokens
            SET used_at = NOW(3)
          WHERE token_hash = ?
            AND purpose = ?
            AND used_at IS NULL
            AND invalidated_at IS NULL
            AND expires_at > NOW(3)`,
        [tokenHash, purpose],
      )) as { affectedRows: number };

      if (result.affectedRows !== 1) return null;

      const rows = (await manager.query(
        `SELECT user_id AS userId, tenant_id AS tenantId, metadata
           FROM auth_tokens WHERE token_hash = ? LIMIT 1`,
        [tokenHash],
      )) as { userId: string; tenantId: string | null; metadata: string | null }[];

      const row = rows[0];
      if (!row) return null;

      return {
        userId: row.userId,
        tenantId: row.tenantId,
        metadata:
          typeof row.metadata === 'string'
            ? (JSON.parse(row.metadata) as Record<string, unknown>)
            : ((row.metadata as Record<string, unknown> | null) ?? null),
      };
    });
  }

  /** Invalidates outstanding tokens — e.g. after a successful password change. */
  async invalidateAll(userId: string, purpose: AuthTokenPurpose): Promise<void> {
    await this.dataSource.query(
      `UPDATE auth_tokens
          SET invalidated_at = NOW(3)
        WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND invalidated_at IS NULL`,
      [userId, purpose],
    );
  }

  /** Nightly cleanup of long-dead rows. */
  async pruneExpired(olderThanDays = 7): Promise<number> {
    const result = (await this.dataSource.query(
      `DELETE FROM auth_tokens
        WHERE expires_at < DATE_SUB(NOW(3), INTERVAL ? DAY)
        LIMIT 10000`,
      [olderThanDays],
    )) as { affectedRows: number };
    return result.affectedRows;
  }
}
