import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { DataSource } from 'typeorm';
import type { AppConfig } from '../../config/configuration';
import { CacheService } from '../services/cache.service';
import { RequestContextService } from '../services/request-context.service';

interface DomainResolution {
  tenantId: string;
  storeId: string | null;
  tenantSlug: string;
  status: string;
}

/**
 * Resolves the tenant and writes it into the active request context
 * (docs/01 §4.1).
 *
 * One strategy per surface, because the trustworthy signal differs:
 *
 *  - **storefront** — the `Host` header, looked up in `tenant_domains`. A shopper
 *    is anonymous, so the hostname is the only tenant signal available.
 *  - **console** — the `tid` claim of a *verified* JWT. Never a header: a header
 *    would let any authenticated merchant read another tenant by changing one value.
 *  - **platform** — no tenant. Cross-tenant access is the point.
 *  - **webhook** — a route parameter, valid only after HMAC verification.
 *
 * The console path resolves nothing here on purpose. This middleware runs before
 * guards, so the JWT is not yet verified; trusting an unverified claim would make
 * tenant isolation forgeable. `JwtAuthGuard` sets it after verification instead.
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);
  private readonly app: AppConfig;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
    private readonly context: RequestContextService,
    configService: ConfigService,
  ) {
    this.app = configService.getOrThrow<AppConfig>('app');
  }

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const ctx = this.context.get();
    if (!ctx) {
      // RequestContextMiddleware must run first; without it there is nothing to
      // write into. Failing loudly beats silently skipping tenant resolution.
      next(new Error('RequestContextMiddleware must be registered before TenantResolverMiddleware'));
      return;
    }

    try {
      switch (ctx.surface) {
        case 'storefront':
          await this.resolveFromHost(req);
          break;

        case 'platform':
          // Intentionally tenant-less. Impersonation is a separate, audited,
          // time-boxed flow rather than an ambient header.
          break;

        case 'webhook':
          this.resolveFromRouteParam(req);
          break;

        case 'console':
        default:
          // Deferred to JwtAuthGuard — see the class comment.
          break;
      }
    } catch (error) {
      this.logger.warn(
        `Tenant resolution failed for ${req.method} ${req.originalUrl}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    // Exposed for param decorators, which read the request rather than the ALS store.
    (req as Request & { emsContext?: unknown }).emsContext = ctx;

    next();
  }

  /**
   * `Host` → tenant, via a 10-minute Redis cache.
   *
   * This runs on **every** storefront request, so an uncached database round-trip
   * here would sit in front of every page view and every add-to-cart. The cache is
   * invalidated explicitly on domain CRUD rather than by TTL alone, so a newly
   * verified custom domain goes live immediately.
   */
  private async resolveFromHost(req: Request): Promise<void> {
    const hostname = this.normalizeHost(req.headers.host ?? '');
    if (!hostname) return;

    const cacheKey = `domain:${hostname}`;
    let resolution = await this.cache.get<DomainResolution>(cacheKey);

    if (!resolution) {
      const rows = (await this.dataSource.query(
        `SELECT d.tenant_id AS tenantId, d.store_id AS storeId,
                t.slug AS tenantSlug, t.status AS status
           FROM tenant_domains d
           JOIN tenants t ON t.id = d.tenant_id
          WHERE d.hostname = ?
            AND t.deleted_at IS NULL
          LIMIT 1`,
        [hostname],
      )) as DomainResolution[];

      resolution = rows[0] ?? null;

      // Negative results are cached too, briefly. Without that, traffic to an
      // unknown host — a stale DNS record, a scanner — hits MySQL on every request.
      await this.cache.set(cacheKey, resolution, resolution ? 600 : 60);
    }

    if (!resolution) return;

    this.context.patch({
      tenantId: String(resolution.tenantId),
      storeId: resolution.storeId ? String(resolution.storeId) : null,
      tenantSlug: resolution.tenantSlug,
      tenantStatus: resolution.status,
    });
  }

  private resolveFromRouteParam(req: Request): void {
    // Recorded but NOT trusted: WebhookSignatureGuard must verify the HMAC before
    // anything acts on this. A webhook URL is effectively public.
    const params = req.params as Record<string, unknown>;
    const raw = params['tenantId'] ?? params['tenant'];
    if (typeof raw === 'string' && raw.length > 0) {
      this.context.patch({ tenantSlug: raw });
    }
  }

  /** Strips the port and lowercases; `Host` includes `:3001` in development. */
  private normalizeHost(host: string): string | null {
    if (!host) return null;
    const withoutPort = host.split(':')[0]!.toLowerCase().trim();
    return withoutPort.length > 0 ? withoutPort : null;
  }
}
