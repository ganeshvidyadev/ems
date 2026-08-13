import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RequestContextService } from './request-context.service';

/** Namespaces with an independent version counter. */
export type CacheNamespace =
  | 'products'
  | 'categories'
  | 'brands'
  | 'home'
  | 'dashboard'
  | 'theme'
  | 'coupons'
  | 'settings'
  | 'inventory';

export interface CacheOptions {
  ttlSeconds?: number;
  /** Serve a stale value for up to 2 s while one caller rebuilds. */
  stampedeProtection?: boolean;
}

const DEFAULT_TTL: Record<CacheNamespace, number> = {
  products: 300,
  categories: 3_600,
  brands: 3_600,
  home: 120,
  dashboard: 60,
  theme: 3_600,
  coupons: 300,
  settings: 600,
  inventory: 30,
};

/**
 * Cache-aside with version-counter invalidation (docs/01 §7).
 *
 * The mechanism: each `(tenant, namespace)` pair owns a monotonic integer, and the
 * version is embedded in every key. Invalidation is a single `INCR`, which orphans
 * every key in that namespace at once and lets TTL reclaim them lazily.
 *
 * The alternative — `SCAN`/`KEYS` over a pattern and delete the matches — is O(keyspace)
 * and blocks or degrades a large Redis. It also races: keys written between the
 * scan and the delete survive, so a merchant can update a price and still see the
 * old one. `INCR` has neither problem, at the cost of one extra `GET` per read
 * (pipelined, so effectively free).
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly context: RequestContextService,
  ) {}

  // -------------------------------------------------------------------------
  // Key construction
  // -------------------------------------------------------------------------

  private versionKey(namespace: CacheNamespace, tenantId: string): string {
    return `t:${tenantId}:ver:${namespace}`;
  }

  private async currentVersion(namespace: CacheNamespace, tenantId: string): Promise<number> {
    const raw = await this.redis.get(this.versionKey(namespace, tenantId));
    return raw ? Number(raw) : 1;
  }

  /**
   * Stable key from an arbitrary query object.
   *
   * Object keys are sorted before hashing, so `{a:1,b:2}` and `{b:2,a:1}` are the
   * same cache entry. Without that, a client that serialises its filters in a
   * different order gets a permanent miss.
   */
  static hashQuery(query: unknown): string {
    const canonical = JSON.stringify(query, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (value as Record<string, unknown>)[key];
            return acc;
          }, {});
      }
      return value;
    });
    return createHash('sha1').update(canonical ?? 'null').digest('hex').slice(0, 16);
  }

  // -------------------------------------------------------------------------
  // Read-through
  // -------------------------------------------------------------------------

  /**
   * Returns the cached value or computes, stores and returns it.
   *
   * Every failure path falls through to `loader`. A cache is an optimisation, and
   * an optimisation that can take the site down when it breaks is a liability —
   * so a Redis outage degrades to direct database reads rather than 500s.
   */
  async wrap<T>(
    namespace: CacheNamespace,
    identifier: string,
    loader: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const tenantId = this.context.tenantId;
    if (!tenantId) return loader();

    const ttl = options.ttlSeconds ?? DEFAULT_TTL[namespace];

    let key: string;
    try {
      const version = await this.currentVersion(namespace, tenantId);
      key = `t:${tenantId}:v${version}:${namespace}:${identifier}`;

      const hit = await this.redis.get(key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      this.logger.warn(
        `Cache read failed for ${namespace}/${identifier}; serving from source: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return loader();
    }

    if (options.stampedeProtection) {
      const guarded = await this.loadWithStampedeGuard(key, loader, ttl);
      if (guarded !== undefined) return guarded;
    }

    const value = await loader();

    try {
      if (value !== undefined && value !== null) {
        await this.redis.setex(key, ttl, JSON.stringify(value));
      }
    } catch (error) {
      this.logger.warn(
        `Cache write failed for ${key}: ` + (error instanceof Error ? error.message : String(error)),
      );
    }

    return value;
  }

  /**
   * Ensures only one caller rebuilds a hot key.
   *
   * Without this, a homepage key expiring under load sends every concurrent
   * request to MySQL at once — the classic thundering herd, and exactly what
   * happens during a flash sale when it hurts most. The mutex holder rebuilds;
   * everyone else waits briefly and re-reads.
   */
  private async loadWithStampedeGuard<T>(
    key: string,
    loader: () => Promise<T>,
    ttl: number,
  ): Promise<T | undefined> {
    const lockKey = `stampede:${key}`;

    try {
      const acquired = await this.redis.set(lockKey, '1', 'EX', 2, 'NX');
      if (acquired) {
        const value = await loader();
        await this.redis.setex(key, ttl, JSON.stringify(value));
        await this.redis.del(lockKey);
        return value;
      }

      // Someone else is rebuilding. Wait a beat and retry the read rather than
      // piling onto the database.
      await new Promise((resolve) => setTimeout(resolve, 120));
      const retry = await this.redis.get(key);
      if (retry !== null) return JSON.parse(retry) as T;
      return undefined;
    } catch {
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Invalidation
  // -------------------------------------------------------------------------

  /** Invalidates a whole namespace for the current tenant with one `INCR`. */
  async invalidate(namespace: CacheNamespace, tenantId?: string): Promise<void> {
    const tenant = tenantId ?? this.context.tenantId;
    if (!tenant) return;

    try {
      await this.redis.incr(this.versionKey(namespace, tenant));
    } catch (error) {
      // A failed invalidation means stale reads until TTL, which is bad but not
      // fatal — and far better than failing the merchant's write.
      this.logger.error(
        `Failed to invalidate ${namespace} for tenant ${tenant}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  async invalidateMany(namespaces: CacheNamespace[], tenantId?: string): Promise<void> {
    const tenant = tenantId ?? this.context.tenantId;
    if (!tenant) return;

    const pipeline = this.redis.pipeline();
    for (const namespace of namespaces) pipeline.incr(this.versionKey(namespace, tenant));
    await pipeline.exec();
  }

  // -------------------------------------------------------------------------
  // Direct access (non-versioned keys: domain lookups, feature flags)
  // -------------------------------------------------------------------------

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      this.logger.warn(`Failed to set ${key}: ${error instanceof Error ? error.message : ''}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch {
      /* best effort */
    }
  }
}
