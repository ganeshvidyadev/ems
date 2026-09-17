import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createTenantRequestSchema,
  suspendTenantRequestSchema,
  tenantListQuerySchema,
  type CreateTenantRequest,
  type SuspendTenantRequest,
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
  @ApiOperation({ summary: "Get a 15-minute session as this tenant's owner, for support investigation" })
  async impersonate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.tenants.impersonate(id, actorFrom(user, request));
  }
}
