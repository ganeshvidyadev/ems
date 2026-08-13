import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, PLATFORM_ONLY_KEY } from '../decorators';
import { PermissionDeniedError } from '../errors/api.errors';
import { PermissionResolverService } from '../../modules/auth/services/permission-resolver.service';
import { AuthLogService } from '../../modules/auth/services/auth-log.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId: string | null;
    userType: 'PLATFORM' | 'TENANT';
    permissions: string[];
    roles: string[];
    tokenType?: string;
  };
}

/**
 * Enforces `@Permissions()` and `@PlatformOnly()`.
 *
 * Runs after `JwtAuthGuard`, so `request.user` is populated and its permissions came
 * from a verified token.
 *
 * Codes are read from the token rather than the database. The staleness window equals
 * the access-token lifetime (10 minutes); urgent revocation goes through the denylist,
 * which every request already checks. Re-querying three tables per call to close a
 * ten-minute window is not a trade worth making on the hot path.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authLog: AuthLogService,
  ) {}

  canActivate(executionContext: ExecutionContext): boolean {
    if (executionContext.getType() !== 'http') return true;

    const handler = executionContext.getHandler();
    const controller = executionContext.getClass();

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, controller])) {
      return true;
    }

    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      handler,
      controller,
    ]);
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      handler,
      controller,
    ]);

    if (!platformOnly && (!required || required.length === 0)) {
      // Authenticated but permissionless — legitimate for "my own profile" routes.
      // A route that *should* be restricted but has no decorator is caught by the
      // route-exposure test, not silently allowed here.
      return true;
    }

    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) throw new PermissionDeniedError(required ?? ['authenticated']);

    // An MFA challenge token must never satisfy a permission check: it is issued
    // before the second factor is verified.
    if (user.tokenType === 'mfa') {
      throw new PermissionDeniedError(required ?? ['authenticated']);
    }

    if (platformOnly && user.userType !== 'PLATFORM') {
      this.deny(user, ['PLATFORM_ONLY'], request);
    }

    if (required && required.length > 0) {
      // OR semantics — any one code suffices. A route genuinely needing two unrelated
      // permissions is usually two routes.
      const satisfied = required.some((code) =>
        PermissionResolverService.satisfies(user.permissions, code),
      );
      if (!satisfied) this.deny(user, required, request);
    }

    return true;
  }

  private deny(
    user: NonNullable<AuthenticatedRequest['user']>,
    required: string[],
    request: AuthenticatedRequest,
  ): never {
    // Logged because a burst of denials for one user is either a broken UI showing
    // actions they cannot perform, or someone probing the API surface. Both are worth
    // seeing.
    this.authLog.record({
      event: 'PERMISSION_DENIED',
      userId: user.id,
      tenantId: user.tenantId,
      detail: {
        required,
        held: user.roles,
        route: (request.route as { path?: string } | undefined)?.path ?? request.path,
        method: request.method,
      },
    });

    throw new PermissionDeniedError(required);
  }
}
