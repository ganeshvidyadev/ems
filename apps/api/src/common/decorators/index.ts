import {
  SetMetadata,
  createParamDecorator,
  applyDecorators,
  UsePipes,
  type ExecutionContext,
} from '@nestjs/common';
import type { ZodTypeAny } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import type { RequestContext } from '../services/request-context.service';

export * from './tenant-scoped.decorator';

export const IS_PUBLIC_KEY = 'ems:is-public';
export const PERMISSIONS_KEY = 'ems:permissions';
export const PLATFORM_ONLY_KEY = 'ems:platform-only';
export const IDEMPOTENT_KEY = 'ems:idempotent';
export const READ_ONLY_KEY = 'ems:read-only';
export const PLAN_QUOTA_KEY = 'ems:plan-quota';
export const ALLOW_ONBOARDING_KEY = 'ems:allow-onboarding';

/**
 * Opts a route out of authentication.
 *
 * The default is **deny**: `JwtAuthGuard` is registered globally, so every route
 * requires a valid token unless it says otherwise here. A route-enumeration test
 * asserts the full list of `@Public()` endpoints against an expected set, so
 * accidentally exposing one fails CI rather than shipping.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Requires permission codes. Multiple codes are OR — holding any one suffices.
 * AND semantics would be modelled by a dedicated composite permission instead,
 * because a route that needs two unrelated permissions is usually two routes.
 */
export const Permissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

/** Restricts a route to `user_type = 'PLATFORM'`, regardless of permissions. */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

/**
 * Marks a mutation as requiring an `Idempotency-Key` header.
 *
 * Applied to anything that moves money or creates external side effects: a shopper
 * double-clicking Pay must not produce two charges.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

/**
 * Routes reads to the replica.
 *
 * Never on a route that reads back its own write — replica lag would show a
 * merchant the product they just created as missing (docs/02 §22).
 */
export const ReadOnly = () => SetMetadata(READ_ONLY_KEY, true);

/** Enforces a plan limit before the handler runs; 402 with actionable detail on breach. */
export const PlanQuota = (limitKey: string) => SetMetadata(PLAN_QUOTA_KEY, limitKey);

/**
 * Allows a route to run while the tenant is still PENDING or PROVISIONING.
 *
 * `TenantStatusGuard` blocks writes for a tenant that is not yet set up — which is right
 * for product and order routes, and a deadlock for the ones that *do* the setting up.
 * Choosing a plan is the write that starts provisioning; blocking it means a new merchant
 * can never subscribe, and their tenant stays PENDING forever.
 *
 * Deliberately opt-in and narrow: only subscription selection, provisioning status and
 * retry should carry it. Anything else touching tenant data before provisioning finishes
 * would race the saga.
 */
export const AllowDuringOnboarding = () => SetMetadata(ALLOW_ONBOARDING_KEY, true);

/** `@Validate(schema)` — shorthand for a body-validating Zod pipe. */
export const Validate = <S extends ZodTypeAny>(schema: S) =>
  applyDecorators(UsePipes(new ZodValidationPipe(schema)));

// ---------------------------------------------------------------------------
// Param decorators
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  id: string;
  publicId: string;
  tenantId: string | null;
  userType: 'PLATFORM' | 'TENANT';
  email: string;
  permissions: readonly string[];
  roles: readonly string[];
  /** Access-token id — the denylist key, and what `logout` revokes. */
  jti: string;
  /** Refresh-token family, so the sessions UI can mark the current device. */
  familyId?: string;
  /** `access` | `storefront` | `mfa`. An `mfa` token must not satisfy permissions. */
  tokenType?: string;
}

/** Injects the authenticated user, or a single field of it. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

/** Injects the resolved tenant id from the ALS context. */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ emsContext?: RequestContext }>();
  return request.emsContext?.tenantId ?? null;
});

export const CorrelationId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ correlationId?: string }>();
  return request.correlationId ?? null;
});

/** Injects the raw `Idempotency-Key` header. */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' ? value : null;
});
