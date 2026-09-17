import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cancelTenantSubscriptionRequestSchema,
  changeTenantPlanRequestSchema,
  createTenantRequestSchema,
  extendTenantTrialRequestSchema,
  impersonateTenantRequestSchema,
  suspendTenantRequestSchema,
  tenantListQuerySchema,
  updateTenantFeatureFlagsRequestSchema,
  type CancelTenantSubscriptionRequest,
  type ChangeTenantPlanRequest,
  type CreateTenantRequest,
  type ExtendTenantTrialRequest,
  type ImpersonateTenantRequest,
  type SuspendTenantRequest,
  type UpdateTenantFeatureFlagsRequest,
} from '@ems/contracts';

import { buildPaginationMeta } from '@ems/contracts';
import { CurrentUser, Permissions, Validate, type AuthenticatedUser } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformTenantService, type AuditActor } from './platform-tenant.service';

function actorFrom(user: AuthenticatedUser, request: Request): AuditActor {
  return { id: user.id, publicId: user.publicId, ip: request.ip, userAgent: request.headers['user-agent'] };
}

@ApiTags('platform-tenants')
@Controller({ path: 'platform/tenants', version: '1' })
export class PlatformTenantController {
  constructor(private readonly tenants: PlatformTenantService) {}

  @Get()
  @Permissions('platform.tenant:read')
  @ApiOperation({ summary: 'List every tenant on the platform' })
  async list(
    @Query(new ZodValidationPipe(tenantListQuerySchema)) query: ReturnType<typeof tenantListQuerySchema.parse>,
  ) {
    const { items, total } = await this.tenants.list(query);
    const domains = await this.tenants.primaryDomains(items.map((t) => t.id));
    return new Paginated(
      items.map((t) => this.tenants.toResponse(t, domains.get(t.id) ?? null)),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get(':id')
  @Permissions('platform.tenant:read')
  @ApiOperation({ summary: 'Get one tenant' })
  async get(@Param('id') id: string) {
    const tenant = await this.tenants.get(id);
    const domains = await this.tenants.primaryDomains([tenant.id]);
    return this.tenants.toResponse(tenant, domains.get(tenant.id) ?? null);
  }

  @Get(':id/overview')
  @Permissions('platform.tenant:read')
  @ApiOperation({ summary: 'Tenant 360 operational snapshot' })
  async overview(@Param('id') id: string) {
    return this.tenants.overview(id);
  }

  @Post()
  @Permissions('platform.tenant:create')
  @Validate(createTenantRequestSchema)
  @ApiOperation({ summary: 'Create a tenant and start it on a plan directly, skipping trial' })
  async create(
    @Body() body: CreateTenantRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const tenant = await this.tenants.create(body, actorFrom(user, request));
    const domains = await this.tenants.primaryDomains([tenant.id]);
    return this.tenants.toResponse(tenant, domains.get(tenant.id) ?? null);
  }

  @Post(':id/suspend')
  @Permissions('platform.tenant:suspend')
  @Validate(suspendTenantRequestSchema)
  @ApiOperation({ summary: 'Suspend a tenant — blocks the storefront and console entirely' })
  async suspend(
    @Param('id') id: string,
    @Body() body: SuspendTenantRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const tenant = await this.tenants.suspend(id, body.reason, actorFrom(user, request));
    return this.tenants.toResponse(tenant);
  }

  @Post(':id/reactivate')
  @Permissions('platform.tenant:reactivate')
  @ApiOperation({ summary: 'Reactivate a suspended tenant' })
  async reactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    const tenant = await this.tenants.reactivate(id, actorFrom(user, request));
    return this.tenants.toResponse(tenant);
  }

  @Delete(':id')
  @Permissions('platform.tenant:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a tenant' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.tenants.remove(id, actorFrom(user, request));
  }

  @Post(':id/impersonate')
  @Permissions('platform.tenant:impersonate')
  @Validate(impersonateTenantRequestSchema)
  @ApiOperation({ summary: "Get a 15-minute session as this tenant's owner, for support investigation" })
  async impersonate(
    @Param('id') id: string,
    @Body() body: ImpersonateTenantRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.tenants.impersonate(id, body.reason, body.referenceId, actorFrom(user, request));
  }

  @Post(':id/subscription/change-plan')
  @Permissions('platform.plan:assign')
  @Validate(changeTenantPlanRequestSchema)
  @ApiOperation({ summary: 'Change a tenant plan and cycle on their behalf' })
  async changePlan(
    @Param('id') id: string,
    @Body() body: ChangeTenantPlanRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.tenants.changePlan(id, body, actorFrom(user, request));
  }

  @Post(':id/subscription/extend-trial')
  @Permissions('platform.tenant:update')
  @Validate(extendTenantTrialRequestSchema)
  @ApiOperation({ summary: 'Extend a tenant trial by a specified number of days' })
  async extendTrial(
    @Param('id') id: string,
    @Body() body: ExtendTenantTrialRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.tenants.extendTrial(id, body, actorFrom(user, request));
  }

  @Post(':id/subscription/cancel')
  @Permissions('platform.tenant:suspend')
  @Validate(cancelTenantSubscriptionRequestSchema)
  @ApiOperation({ summary: 'Cancel a tenant subscription immediately or at period end' })
  async cancelSubscription(
    @Param('id') id: string,
    @Body() body: CancelTenantSubscriptionRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.tenants.cancelSubscription(id, body, actorFrom(user, request));
  }

  @Post(':id/subscription/resume')
  @Permissions('platform.tenant:reactivate')
  @ApiOperation({ summary: 'Resume a scheduled cancellation for a tenant' })
  async resumeSubscription(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.tenants.resumeSubscription(id, actorFrom(user, request));
  }

  @Get(':id/features')
  @Permissions('platform.tenant:read')
  @ApiOperation({ summary: 'Get tenant feature flag overrides' })
  async getFeatureFlags(@Param('id') id: string) {
    return this.tenants.getFeatureFlags(id);
  }

  @Put(':id/features')
  @Permissions('platform.tenant:update')
  @Validate(updateTenantFeatureFlagsRequestSchema)
  @ApiOperation({ summary: 'Update tenant feature flag overrides' })
  async updateFeatureFlags(
    @Param('id') id: string,
    @Body() body: UpdateTenantFeatureFlagsRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.tenants.updateFeatureFlags(id, body, actorFrom(user, request));
  }


  /**
   * Called by the impersonated caller's own session when they exit — not the
   * admin's, there is no admin-side request at this point. No `@Permissions()`:
   * any authenticated caller may end their own current impersonation, the same
   * "authenticated but permissionless" shape as changing one's own password.
   * A no-op if the caller isn't actually impersonating (nothing to record).
   */
  @Post('exit-impersonation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "End the caller's own active impersonation session" })
  async exitImpersonation(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    if (user.actingAs && user.tenantId) {
      await this.tenants.exitImpersonation(user.tenantId, user.actingAs, user.jti, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
    return { ok: true };
  }
}
