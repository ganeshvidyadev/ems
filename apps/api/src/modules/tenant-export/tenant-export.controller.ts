import { Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { TenantExportService } from './tenant-export.service';

@ApiTags('platform-tenants')
@Controller({ version: '1' })
export class TenantExportController {
  constructor(private readonly exports: TenantExportService) {}

  @Post('platform/tenants/:id/export')
  @Permissions('platform.tenant:export')
  @ApiOperation({ summary: 'Export every row this tenant owns as a downloadable archive — poll GET console/jobs/:id for the result' })
  async export(@Param('id') id: string) {
    return this.exports.enqueue(id);
  }
}
