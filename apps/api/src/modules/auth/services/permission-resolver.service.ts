import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

export interface ResolvedAuthorization {
  roles: string[];
  permissions: string[];
}

/**
 * Resolves a user's effective roles and permissions.
 *
 * Called on login and on token refresh — **not** on every request, because
 * permissions are embedded in the access token. That bounds staleness to the token
 * lifetime (10 minutes) instead of paying a three-table join per API call.
 *
 * Results are additionally cached in Redis behind a version counter, so a role change
 * invalidates every affected user with one `INCR` rather than needing to know which
 * users held that role.
 */
@Injectable()
export class PermissionResolverService {
  private readonly logger = new Logger(PermissionResolverService.name);
  private static readonly CACHE_TTL_SECONDS = 300;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private versionKey(tenantId: string | null): string {
    return `t:${tenantId ?? 'platform'}:ver:authz`;
  }

  private cacheKey(version: number, userId: string, storeId: string | null): string {
    return `authz:v${version}:u${userId}:s${storeId ?? 'all'}`;
  }

  async resolve(
    userId: string,
    tenantId: string | null,
    storeId: string | null = null,
  ): Promise<ResolvedAuthorization> {
    let cacheKey: string | null = null;

    try {
      const version = Number((await this.redis.get(this.versionKey(tenantId))) ?? 1);
      cacheKey = this.cacheKey(version, userId, storeId);

      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as ResolvedAuthorization;
    } catch (error) {
      // Cache miss by failure. Falls through to the database — authorization must
      // never depend on Redis being up.
      this.logger.warn(
        `Authorization cache unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const resolved = await this.loadFromDatabase(userId, storeId);

    if (cacheKey) {
      try {
        await this.redis.setex(
          cacheKey,
          PermissionResolverService.CACHE_TTL_SECONDS,
          JSON.stringify(resolved),
        );
      } catch {
        /* best effort */
      }
    }

    return resolved;
  }

  /**
   * The authorization query.
   *
   * Two filters carry real weight:
   *
   *  - `ur.expires_at IS NULL OR ur.expires_at > NOW(3)` — a time-boxed grant
   *    (contractor access, support elevation) must stop working the moment it lapses,
   *    not whenever a cleanup job next runs.
   *  - `ur.store_scope IN (0, :storeId)` — 0 means tenant-wide. Omitting it would
   *    make a role scoped to one store apply to every store.
   */
  private async loadFromDatabase(
    userId: string,
    storeId: string | null,
  ): Promise<ResolvedAuthorization> {
    const rows = (await this.dataSource.query(
      `SELECT DISTINCT r.code AS roleCode, p.code AS permissionCode
         FROM user_roles ur
         JOIN roles r            ON r.id = ur.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ?
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW(3))
          AND (ur.store_scope = 0 OR ur.store_scope = ?)`,
      [userId, storeId ?? 0],
    )) as { roleCode: string; permissionCode: string | null }[];

    const roles = new Set<string>();
    const permissions = new Set<string>();

    for (const row of rows) {
      roles.add(row.roleCode);
      if (row.permissionCode) permissions.add(row.permissionCode);
    }

    return { roles: [...roles].sort(), permissions: [...permissions].sort() };
  }

  /**
   * Invalidates cached authorization for a whole tenant.
   *
   * One `INCR` rather than deleting per-user keys, because a role edit affects an
   * unknown set of users and enumerating them would need the very query we are trying
   * to avoid.
   */
  async invalidate(tenantId: string | null): Promise<void> {
    try {
      await this.redis.incr(this.versionKey(tenantId));
    } catch (error) {
      // Stale permissions until TTL — degraded, but the alternative is failing the
      // merchant's role edit.
      this.logger.error(
        `Failed to invalidate authorization cache for tenant ${tenantId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /**
   * Tests a required code against a held set, honouring wildcards.
   *
   * `*` is granted to STORE_OWNER and `platform.*` to PLATFORM_SUPER_ADMIN, so a
   * newly added permission is not silently withheld from the roles that are meant to
   * have everything.
   */
  static satisfies(held: readonly string[], required: string): boolean {
    if (held.includes(required)) return true;
    if (held.includes('*')) return true;

    const colonIndex = required.indexOf(':');
    if (colonIndex > 0) {
      const resource = required.slice(0, colonIndex);
      if (held.includes(`${resource}:*`)) return true;

      // `platform.tenant:read` is also covered by `platform.*`.
      const dotIndex = resource.indexOf('.');
      if (dotIndex > 0 && held.includes(`${resource.slice(0, dotIndex)}.*`)) return true;
    }

    return false;
  }
}
