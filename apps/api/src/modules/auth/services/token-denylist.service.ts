import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/**
 * Revocation list for access tokens, keyed by `jti`.
 *
 * A JWT is self-contained, so nothing stops a stolen one from being accepted until
 * it expires. That is the cost of statelessness, and a 10-minute window is too long
 * for "log out everywhere" or "revoke this compromised session" to be meaningless.
 *
 * The compensating control is one `EXISTS` per request. Redis answers it in well
 * under a millisecond, which buys back real revocation for a rounding error of
 * latency — a far better trade than making every request re-read the user row.
 *
 * **Entries carry a TTL equal to the token's remaining lifetime, not a fixed
 * duration.** Once a token has expired it is rejected by signature verification
 * anyway, so keeping its `jti` any longer grows the keyspace without adding
 * security.
 */
@Injectable()
export class TokenDenylistService {
  private readonly logger = new Logger(TokenDenylistService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(jti: string): string {
    return `jwt:deny:${jti}`;
  }

  private familyKey(familyId: string): string {
    return `jwt:deny:fam:${familyId}`;
  }

  /**
   * Revokes one access token.
   *
   * `expiresAt` comes from the token's own `exp`, so the entry disappears exactly
   * when the token becomes unusable on its own.
   */
  async revoke(jti: string, expiresAt: Date, reason = 'REVOKED'): Promise<void> {
    const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1_000);
    // Already expired — signature verification will reject it, so there is nothing
    // to add.
    if (ttlSeconds <= 0) return;

    try {
      await this.redis.setex(this.key(jti), ttlSeconds, reason);
    } catch (error) {
      // Deliberately loud and rethrown. Every other Redis failure in this codebase
      // degrades gracefully, but a silently-failed revocation leaves a token the
      // user believes is dead still working — the caller must know.
      this.logger.error(
        `Failed to denylist jti ${jti}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Revokes every access token belonging to a refresh-token family.
   *
   * Needed because reuse detection revokes a family in MySQL, but access tokens
   * already minted from that family are still cryptographically valid and are not
   * individually known to us. Marking the family lets the guard reject them by their
   * `fam` claim, which is what makes "a stolen refresh token is contained" actually
   * true rather than true-in-ten-minutes.
   */
  async revokeFamily(familyId: string, ttlSeconds: number, reason = 'FAMILY_REVOKED'): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.setex(this.familyKey(familyId), ttlSeconds, reason);
  }

  /**
   * True if the token has been revoked.
   *
   * Checks `jti` and `fam` in one pipeline — two round-trips on the hot path would
   * double the cost for no reason.
   */
  async isRevoked(jti: string, familyId?: string): Promise<boolean> {
    try {
      if (!familyId) {
        return (await this.redis.exists(this.key(jti))) === 1;
      }

      const results = await this.redis
        .pipeline()
        .exists(this.key(jti))
        .exists(this.familyKey(familyId))
        .exec();

      if (!results) return false;
      return results.some(([, value]) => value === 1);
    } catch (error) {
      // Fail **open** on a Redis outage, and say so loudly.
      //
      // Failing closed would reject every authenticated request the moment Redis
      // blinks — converting a cache outage into a total outage. Tokens still expire
      // in 10 minutes, so the exposure is bounded and far smaller than the
      // alternative. This is a deliberate availability-over-revocation trade and
      // should be revisited if revocation ever becomes safety-critical.
      this.logger.error(
        `Denylist unavailable, allowing request (jti ${jti}): ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return false;
    }
  }

  /** Test/ops helper — lifts a revocation. */
  async clear(jti: string): Promise<void> {
    await this.redis.del(this.key(jti));
  }
}
