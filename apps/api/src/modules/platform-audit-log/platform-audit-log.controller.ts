import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { platformAuditLogListQuerySchema, buildPaginationMeta } from '@ems/contracts';
import { Permissions } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuditLogService } from './platform-audit-log.service';

@ApiTags('platform-audit-log')
@Controller({ path: 'platform/audit-logs', version: '1' })
export class PlatformAuditLogController {
  constructor(private readonly auditLogs: PlatformAuditLogService) {}

  @Get()
  @Permissions('platform.auditlog:read')
  @ApiOperation({ summary: 'Cross-tenant audit trail of privileged mutations' })
  async list(
    @Query(new ZodValidationPipe(platformAuditLogListQuerySchema))
    query: ReturnType<typeof platformAuditLogListQuerySchema.parse>,
  ) {
    const { items, total } = await this.auditLogs.list(query);
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, total));
  }
}
