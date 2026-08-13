import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';
import {
  AuthTokenInvalidError,
  AuthTokenMissingError,
  AuthTokenRevokedError,
} from '../errors/api.errors';
import { RequestContextService } from '../services/request-context.service';
import { TokenService, type AccessTokenClaims } from '../../modules/auth/services/token.service';
import { TokenDenylistService } from '../../modules/auth/services/token-denylist.service';

/**
 * Global authentication guard.
 *
 * **Default is deny.** Registered app-wide, so every route requires a valid token
 * unless it carries `@Public()`. The inverse — opt-in protection — means a forgotten
 * decorator silently exposes an endpoint, and nothing fails until someone notices.
 * `test/unit/route-exposure.spec.ts` additionally asserts the full `@Public()` set
 * against an expected list, so exposing a route is a deliberate, reviewed act.
 *
 * This guard is also where **console tenant context is established**, from the
 * verified `tid` claim. `TenantResolverMiddleware` deliberately does not do it: it
 * runs before guards, when the JWT is still unverified, and trusting an unverified
 * claim would make tenant isolation forgeable by editing a token payload.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly denylist: TokenDenylistService,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    if (executionContext.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);

    const request = executionContext.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (isPublic) {
      // Public routes still *use* a token when one is present, so a storefront page
      // can greet a signed-in customer. A bad token on a public route is ignored
      // rather than rejected — otherwise an expired cookie would break browsing.
      if (token) {
        try {
          await this.attachIdentity(request, token);
        } catch {
          /* anonymous */
        }
      }
      return true;
    }

    if (!token) throw new AuthTokenMissingError();

    await this.attachIdentity(request, token);
    return true;
  }

  private async attachIdentity(request: Request, token: string): Promise<void> {
    const claims: AccessTokenClaims = this.tokens.verifyAccessToken(token);

    // Checked after signature verification, never before: an unverified token's `jti`
    // is attacker-controlled and could be used to probe the denylist.
    if (await this.denylist.isRevoked(claims.jti, claims.fam)) {
      throw new AuthTokenRevokedError();
    }

    if (!claims.uid) throw new AuthTokenInvalidError('Token is missing a subject');

    (request as Request & { user?: unknown }).user = {
      id: claims.uid,
      publicId: claims.sub,
      tenantId: claims.tid,
      userType: claims.userType,
      email: '',
      permissions: claims.perms ?? [],
      roles: claims.roles ?? [],
      jti: claims.jti,
      familyId: claims.fam,
      tokenType: claims.typ,
    };

    // Tenant context from the *verified* claim. Platform tokens carry `tid: null` and
    // legitimately stay tenant-less — cross-tenant access is the point of that surface.
    this.context.patch({
      userId: claims.uid,
      userType: claims.userType,
      permissions: claims.perms ?? [],
      roles: claims.roles ?? [],
      planCode: claims.planCode ?? null,
      ...(claims.tid ? { tenantId: claims.tid } : {}),
      ...(claims.sid ? { storeId: claims.sid } : {}),
    });
  }
}

/**
 * Reads the bearer token.
 *
 * Header first, then an `access_token` cookie — the storefront authenticates
 * customers with a cookie because a server-rendered page has no opportunity to attach
 * an Authorization header. The console always uses the header, since its token lives
 * in memory only.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;

  if (header) {
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
    // A malformed Authorization header is not silently ignored — falling through to
    // the cookie would make a broken client look anonymous instead of misconfigured.
    return null;
  }

  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.['access_token'] ?? null;
}
