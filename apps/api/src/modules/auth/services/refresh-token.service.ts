import { Injectable, Logger } from '@nestjs/common';
import { DomainError, newPublicId } from '@ems/kernel';
import { ErrorCode } from '@ems/contracts';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity, type RevokeReason, type UserType } from '../../../database/entities';
import { CryptoService } from '../../../common/services/crypto.service';
import { TokenService } from './token.service';
import { TokenDenylistService } from './token-denylist.service';
import { AuthLogService } from './auth-log.service';

export interface IssuedRefreshToken {
  /** Plaintext — returned once, set as an httpOnly cookie, never stored. */
  token: string;
  familyId: string;
  jti: string;
  expiresAt: Date;
  recordId: string;
}

export interface RotationContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
}

/**
 * Raised on replay of an already-consumed token. The family is dead by the time it throws.
 *
 * Extends `DomainError` so the global exception filter maps it to 401
 * `AUTH_REFRESH_TOKEN_REUSED` from the registry. A plain `Error` would surface as a 500,
 * which is both wrong and actively harmful here: the console's Axios interceptor keys off
 * this code to stop retrying and force a fresh login, and a 500 would make it retry a
 * refresh that can never succeed.
 *
 * The message is deliberately the same whether the token was replayed, expired, or never
 * existed — a differentiated message would confirm which tokens had once been issued.
 */
export class RefreshTokenReuseError extends DomainError {
  readonly code = ErrorCode.AUTH_REFRESH_TOKEN_REUSED;

  constructor(readonly familyId: string) {
    super('This session is no longer valid. Please sign in again.');
  }
}

/**
 * Refresh tokens with rotation and family-level reuse detection (docs/01 §8.1).
 *
 * The problem this solves: a refresh token lives 30 days, so a stolen one is a
 * 30-day backdoor, and nothing about a valid token distinguishes the thief from the
 * user.
 *
 * Rotation alone does not fix it — it just means whoever refreshes *second* gets an
 * error, and the victim silently reauthenticating is indistinguishable from noise.
 * The insight is that a **consumed token being presented again is proof of
 * compromise**: the legitimate client discarded it after use, so a replay means two
 * parties hold the same token. Since we cannot tell which is which, the only safe
 * response is to kill the whole lineage and make both reauthenticate.
 *
 * Without family tracking, revoking just the replayed token would leave the
 * attacker's freshly-rotated token alive — actively worse, because it evicts the
 * victim and keeps the intruder.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: CryptoService,
    private readonly tokens: TokenService,
    private readonly denylist: TokenDenylistService,
    private readonly authLog: AuthLogService,
  ) {}

  // -------------------------------------------------------------------------
  // Issue
  // -------------------------------------------------------------------------

  /** Starts a new family. Called on a fresh login, never on refresh. */
  async issue(
    userId: string,
    tenantId: string | null,
    userType: UserType,
    context: RotationContext = {},
  ): Promise<IssuedRefreshToken> {
    return this.persist(userId, tenantId, userType, newPublicId(), null, context);
  }

  private async persist(
    userId: string,
    tenantId: string | null,
    userType: UserType,
    familyId: string,
    parentId: string | null,
    context: RotationContext,
  ): Promise<IssuedRefreshToken> {
    // 32 bytes of CSPRNG output. The token is never guessed, only stolen — which is
    // why the defence is replay detection rather than entropy.
    const plaintext = this.crypto.generateToken(32);
    const jti = newPublicId();
    const expiresAt = new Date(Date.now() + this.tokens.refreshTtlSeconds * 1_000);

    const repository = this.dataSource.getRepository(RefreshTokenEntity);
    const record = await repository.save(
      repository.create({
        userId,
        tenantId,
        userType,
        familyId,
        // Only the hash is persisted; a DB leak yields nothing usable.
        tokenHash: this.crypto.hashToken(plaintext),
        parentId,
        jti,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
        ipAddress: context.ipAddress ? ipToBuffer(context.ipAddress) : null,
        deviceLabel: context.deviceLabel?.slice(0, 120) ?? null,
        expiresAt,
      }),
    );

    return { token: plaintext, familyId, jti, expiresAt, recordId: record.id };
  }

  // -------------------------------------------------------------------------
  // Rotate
  // -------------------------------------------------------------------------

  /**
   * Consumes a refresh token and issues its successor.
   *
   * The consume step is a **conditional UPDATE**, not a read-then-write:
   *
   *   UPDATE refresh_tokens SET used_at = NOW(3)
   *    WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW(3)
   *
   * MySQL applies this atomically, so of two concurrent requests presenting the same
   * token exactly one reports `affectedRows = 1`. A `SELECT` followed by an `UPDATE`
   * would let both pass the check and both mint a successor — silently forking the
   * family and defeating the detection this class exists to provide.
   */
  async rotate(
    plaintext: string,
    context: RotationContext = {},
  ): Promise<IssuedRefreshToken> {
    const tokenHash = this.crypto.hashToken(plaintext);

    const claimed = await this.dataSource.transaction(async (manager) => {
      const result = (await manager.query(
        `UPDATE refresh_tokens
            SET used_at = NOW(3)
          WHERE token_hash = ?
            AND used_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > NOW(3)`,
        [tokenHash],
      )) as { affectedRows: number };

      if (result.affectedRows === 1) {
        const rows = (await manager.query(
          `SELECT id, user_id AS userId, tenant_id AS tenantId, user_type AS userType, family_id AS familyId
             FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
          [tokenHash],
        )) as { id: string; userId: string; tenantId: string | null; userType: UserType; familyId: string }[];
        return { claimed: true as const, row: rows[0]! };
      }

      // Did not claim it. Distinguish the two reasons, because they mean very
      // different things: an unknown hash is noise, whereas a *known* token that was
      // already consumed is evidence of theft.
      const existing = (await manager.query(
        `SELECT id, user_id AS userId, tenant_id AS tenantId, family_id AS familyId,
                used_at AS usedAt, revoked_at AS revokedAt, expires_at AS expiresAt
           FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
        [tokenHash],
      )) as {
        id: string;
        userId: string;
        tenantId: string | null;
        familyId: string;
        usedAt: Date | null;
        revokedAt: Date | null;
        expiresAt: Date;
      }[];

      return { claimed: false as const, row: existing[0] ?? null };
    });

    if (!claimed.claimed) {
      const row = claimed.row;

      if (row && row.usedAt !== null) {
        // Replay of a consumed token: burn the family.
        await this.revokeFamily(row.familyId, 'REUSE_DETECTED');

        await this.authLog.record({
          event: 'TOKEN_REUSE_DETECTED',
          userId: row.userId,
          tenantId: row.tenantId,
          ip: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          // Highest severity in the system: this is the only signal that reliably
          // indicates a stolen credential rather than a user mistake.
          riskScore: 100,
          detail: { familyId: row.familyId, reason: 'consumed token presented again' },
        });

        this.logger.warn(
          `Refresh token reuse detected for user ${row.userId}; revoked family ${row.familyId}`,
        );
        throw new RefreshTokenReuseError(row.familyId);
      }

      // Unknown, expired, or already-revoked. Indistinguishable to the caller on
      // purpose — a differentiated error would confirm which tokens once existed.
      throw new RefreshTokenReuseError(row?.familyId ?? 'unknown');
    }

    const row = claimed.row;
    return this.persist(row.userId, row.tenantId, row.userType, row.familyId, row.id, context);
  }

  // -------------------------------------------------------------------------
  // Revoke
  // -------------------------------------------------------------------------

  /** Revokes a single token — normal logout. */
  async revokeByToken(plaintext: string, reason: RevokeReason = 'LOGOUT'): Promise<void> {
    await this.dataSource.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW(3), revoked_reason = ?
        WHERE token_hash = ? AND revoked_at IS NULL`,
      [reason, this.crypto.hashToken(plaintext)],
    );
  }

  /**
   * Revokes an entire family and denylists its live access tokens.
   *
   * Both halves are required: the MySQL update stops future refreshes, and the Redis
   * family marker stops access tokens already minted from this family — which remain
   * cryptographically valid for up to their full lifetime.
   */
  async revokeFamily(familyId: string, reason: RevokeReason = 'REUSE_DETECTED'): Promise<void> {
    await this.dataSource.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW(3), revoked_reason = ?
        WHERE family_id = ? AND revoked_at IS NULL`,
      [reason, familyId],
    );

    await this.denylist.revokeFamily(familyId, this.tokens.accessTtlSeconds, reason);
  }

  /** Revokes every session for a user — password change, admin action, logout-all. */
  async revokeAllForUser(userId: string, reason: RevokeReason = 'LOGOUT_ALL'): Promise<number> {
    const families = (await this.dataSource.query(
      `SELECT DISTINCT family_id AS familyId
         FROM refresh_tokens
        WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    )) as { familyId: string }[];

    const result = (await this.dataSource.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW(3), revoked_reason = ?
        WHERE user_id = ? AND revoked_at IS NULL`,
      [reason, userId],
    )) as { affectedRows: number };

    // Every family is denylisted too, otherwise "log out everywhere" would leave up
    // to 10 minutes of usable access tokens behind — exactly the window someone
    // changing a compromised password is trying to close.
    await Promise.all(
      families.map((family) =>
        this.denylist.revokeFamily(family.familyId, this.tokens.accessTtlSeconds, reason),
      ),
    );

    return result.affectedRows;
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /**
   * Active sessions for the sessions-management UI.
   *
   * One row per family, not per token: rotation creates a new row on every refresh,
   * so listing rows would show a user dozens of "devices" for a single browser.
   */
  async listActiveSessions(userId: string): Promise<
    {
      familyId: string;
      jti: string;
      deviceLabel: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      createdAt: Date;
      lastUsedAt: Date | null;
      expiresAt: Date;
    }[]
  > {
    return (await this.dataSource.query(
      `SELECT t.family_id                        AS familyId,
              t.jti                              AS jti,
              t.device_label                     AS deviceLabel,
              INET6_NTOA(t.ip_address)           AS ipAddress,
              t.user_agent                       AS userAgent,
              f.first_seen                       AS createdAt,
              t.used_at                          AS lastUsedAt,
              t.expires_at                       AS expiresAt
         FROM refresh_tokens t
         JOIN (
              SELECT family_id, MIN(created_at) AS first_seen, MAX(id) AS latest_id
                FROM refresh_tokens
               WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW(3)
               GROUP BY family_id
         ) f ON f.latest_id = t.id
        ORDER BY f.first_seen DESC`,
      [userId],
    )) as never;
  }

  /** Deletes long-expired rows. Run nightly; keeps the table from growing forever. */
  async pruneExpired(olderThanDays = 7): Promise<number> {
    const result = (await this.dataSource.query(
      `DELETE FROM refresh_tokens
        WHERE expires_at < DATE_SUB(NOW(3), INTERVAL ? DAY)
        LIMIT 10000`,
      [olderThanDays],
    )) as { affectedRows: number };
    return result.affectedRows;
  }
}

/**
 * IPv4/IPv6 → 16-byte buffer, matching MySQL's `INET6_ATON`.
 *
 * Done in application code rather than passing a string to `INET6_ATON` so that a
 * malformed address becomes a NULL column instead of a SQL error that fails the
 * whole login.
 */
function ipToBuffer(ip: string): Buffer | null {
  const cleaned = ip.trim().replace(/^::ffff:/i, '');

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(cleaned);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    return Buffer.from(octets);
  }

  if (cleaned.includes(':')) {
    try {
      const groups = expandIpv6(cleaned);
      if (!groups) return null;
      const buffer = Buffer.alloc(16);
      groups.forEach((group, index) => buffer.writeUInt16BE(group, index * 2));
      return buffer;
    } catch {
      return null;
    }
  }

  return null;
}

function expandIpv6(address: string): number[] | null {
  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':').filter(Boolean) : [];
  const tailGroups = tail ? tail.split(':').filter(Boolean) : [];

  if (address.includes('::')) {
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 0) return null;
    const groups = [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
    return groups.map((group) => parseInt(group, 16));
  }

  if (headGroups.length !== 8) return null;
  return headGroups.map((group) => parseInt(group, 16));
}
