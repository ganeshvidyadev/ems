import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, PLAN_QUOTA_KEY } from '../decorators';
import type { PlanLimitKey } from '../../database/entities';
import { PlanQuotaService } from '../../modules/subscription/services/plan-quota.service';
import { RequestContextService } from '../services/request-context.service';

/**
 * Enforces `@PlanQuota('max_products')` on create routes.
 *
 * Runs **before** the handler, so a merchant at their cap is told so instead of having a
 * product created and then rolled back — which would burn an auto-increment id and, worse,
 * could leave partially-created related rows behind.
 *
 * This is a pre-flight check, not a reservation. Between the check and the insert a
 * concurrent request could take the last slot, so a determined burst can overshoot a cap
 * by a small margin. That is an accepted trade: the alternative is serialising every
 * create behind a per-tenant lock, which would cost far more than the occasional 101st
 * product. Hard limits that must never be exceeded (billing, not capacity) are enforced by
 * a database constraint instead.
 */
@Injectable()
export class PlanQuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quotas: PlanQuotaService,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    if (executionContext.getType() !== 'http') return true;

    const handler = executionContext.getHandler();
    const controller = executionContext.getClass();

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, controller])) {
      return true;
    }

    const limitKey = this.reflector.getAllAndOverride<PlanLimitKey>(PLAN_QUOTA_KEY, [
      handler,
      controller,
    ]);
    if (!limitKey) return true;

    const tenantId = this.context.tenantId;
    // Platform routes and system work have no tenant and therefore no plan.
    if (!tenantId) return true;

    // Throws PlanQuotaExceededError → 402 with { limitKey, current, max, upgradeUrl }.
    await this.quotas.assertWithinLimit(tenantId, limitKey, 1);

    return true;
  }
}
