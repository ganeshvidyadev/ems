import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';
import { ServiceUnavailableError } from '../errors/api.errors';
import { PlatformSettingsService } from '../../modules/platform-settings/platform-settings.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Platform-wide kill switch for writes — `platform.settings`'s one behavioral
 * consumer.
 *
 * Reads only stay open (a shopper mid-checkout can still see their cart; a
 * merchant can still see their dashboard) — only mutations are blocked, same
 * distinction `TenantStatusGuard` draws for `PAST_DUE`. Only `platform/settings`
 * is exempt — not every `platform/*` route, which would exempt the entire
 * Super Admin panel this was meant to constrain too — so a platform admin can
 * always call `PUT platform/settings` to turn it back off.
 */
@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: PlatformSettingsService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    if (executionContext.getType() !== 'http') return true;

    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        executionContext.getHandler(),
        executionContext.getClass(),
      ])
    ) {
      return true;
    }

    const request = executionContext.switchToHttp().getRequest<Request>();
    if (!WRITE_METHODS.has(request.method)) return true;
    if (request.path.startsWith('/api/v1/platform/settings')) return true;

    const { enabled, message } = await this.settings.get('maintenance_mode', {
      enabled: false,
      message: '',
    });
    if (enabled) throw new ServiceUnavailableError(message);

    return true;
  }
}
