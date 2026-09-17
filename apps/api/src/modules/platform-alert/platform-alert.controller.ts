import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildPaginationMeta, platformAlertListQuerySchema } from '@ems/contracts';
import { CurrentUser, Permissions, type AuthenticatedUser } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuditActor } from '../platform-tenant/platform-tenant.service';
import { PlatformAlertService } from './platform-alert.service';

function actorFrom(user: AuthenticatedUser, request: Request): AuditActor {
  return { id: user.id, publicId: user.publicId, ip: request.ip, userAgent: request.headers['user-agent'] };
}

@ApiTags('platform-alerts')
@Controller({ path: 'platform/alerts', version: '1' })
export class PlatformAlertController {
  constructor(private readonly alerts: PlatformAlertService) {}

  @Get()
  @Permissions('platform.alert:read')
  @ApiOperation({ summary: 'Every alert, reconciled against live conditions on each call' })
  async list(
    @Query(new ZodValidationPipe(platformAlertListQuerySchema))
    query: ReturnType<typeof platformAlertListQuerySchema.parse>,
  ) {
    const { items, total } = await this.alerts.list(query);
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, total));
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @Permissions('platform.alert:update')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  async acknowledge(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.alerts.acknowledge(id, actorFrom(user, request));
    return { ok: true };
  }

  @Post(':id/investigate')
  @HttpCode(HttpStatus.OK)
  @Permissions('platform.alert:update')
  @ApiOperation({ summary: 'Mark an alert as being investigated' })
  async investigate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.alerts.investigate(id, actorFrom(user, request));
    return { ok: true };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Permissions('platform.alert:update')
  @ApiOperation({ summary: 'Resolve an alert' })
  async resolve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.alerts.resolve(id, actorFrom(user, request));
    return { ok: true };
  }
}
