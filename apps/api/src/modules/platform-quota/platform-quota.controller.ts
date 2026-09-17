import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { PlatformQuotaService } from './platform-quota.service';

@ApiTags('platform-quota')
@Controller({ path: 'platform/quota', version: '1' })
export class PlatformQuotaController {
  constructor(private readonly quota: PlatformQuotaService) {}

  @Get()
  @Permissions('platform.quota:read')
  @ApiOperation({ summary: 'Every tenant, every quota dimension, current usage vs. plan limit' })
  overview() {
    return this.quota.overview();
  }
}
