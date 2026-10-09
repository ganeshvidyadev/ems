import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators';
import { RateLimitExceededError } from '../errors/api.errors';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Credential-style endpoints that are always throttled, without a decorator on each
 * controller. Matches `/auth/...` and `/storefront/auth/...` (POST only).
 */
const AUTH_ROUTES = [
  /\/auth\/login$/,
  /\/auth\/register$/,
  /\/auth\/forgot-password$/,
  /\/auth\/reset-password$/,
  /\/auth\/resend-verification$/,
  /\/auth\/verify-email$/,
  /\/auth\/otp\/(request|verify)$/,
  /\/auth\/mfa\/verify$/,
];

/** An IP may try this many times more often than a single identity before being cut off. */
const IP_MULTIPLIER = 6;

const WINDOW_SECONDS = 60;

/**
 * Fixed-window, Redis-backed throttle for abuse-prone public endpoints.
 *
 * Deliberately *not* a blanket per-IP limit on every route: storefront traffic reaches
 * this API through the Next.js server, so many shoppers can share one source IP and a
 * blanket limit would throttle legitimate customers. Instead:
 *
 *  - credential endpoints (login, register, password reset, OTP, MFA) are limited per
 *    (IP, submitted identity) at `RATE_LIMIT_AUTH_PER_MIN`, plus a looser per-IP ceiling,
 *    which stops both single-account guessing and credential spraying;
 *  - routes tagged `@RateLimit({...})` (e.g. gift-card balance lookups, which are a
 *    valid/invalid oracle for card codes) use their own limit, keyed per (IP, tenant).
 *
 * Fails open if Redis is unavailable: throttling must never take authentication down.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly config: { enabled: boolean; authPerMin: number; defaultPerMin: number };

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.config = configService.getOrThrow<{ enabled: boolean; authPerMin: number; defaultPerMin: number }>('rateLimit');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.enabled || context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? 'unknown';

    const tagged = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (tagged) {
      const tenant = String(request.headers['x-ems-hostname'] ?? request.headers.host ?? '');
      await this.consume(`${tagged.name}:${ip}:${tenant}`, tagged.limit);
      return true;
    }

    if (request.method === 'POST' && AUTH_ROUTES.some((pattern) => pattern.test(request.path))) {
      const identity = this.identityOf(request);
      await this.consume(`auth:${ip}:${identity}`, this.config.authPerMin);
      await this.consume(`auth-ip:${ip}`, this.config.authPerMin * IP_MULTIPLIER);
    }
    return true;
  }

  private identityOf(request: Request): string {
    const body = request.body as { email?: unknown; phone?: unknown } | undefined;
    const raw = typeof body?.email === 'string' ? body.email : typeof body?.phone === 'string' ? body.phone : '';
    return raw.trim().toLowerCase().slice(0, 254) || 'anonymous';
  }

  private async consume(key: string, limit: number): Promise<void> {
    const redisKey = `rl:${key}`;
    let count: number;
    let ttl: number;
    try {
      count = await this.redis.incr(redisKey);
      if (count === 1) await this.redis.expire(redisKey, WINDOW_SECONDS);
      ttl = count === 1 ? WINDOW_SECONDS : await this.redis.ttl(redisKey);
    } catch (error) {
      this.logger.warn(`Rate limiter unavailable, failing open: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (count > limit) throw new RateLimitExceededError(ttl > 0 ? ttl : WINDOW_SECONDS);
  }
}
