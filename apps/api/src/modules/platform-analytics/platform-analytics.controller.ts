import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { PlatformAnalyticsService } from './platform-analytics.service';

@ApiTags('platform-analytics')
@Controller({ path: 'platform/analytics', version: '1' })
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('summary')
  @Permissions('platform.analytics:read')
  @ApiOperation({ summary: 'Platform-wide tenant, revenue and operational metrics' })
  summary() {
    return this.analytics.summary();
  }
}
