import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { PlatformHealthService } from './platform-health.service';

@ApiTags('platform-health')
@Controller({ path: 'platform/health', version: '1' })
export class PlatformHealthController {
  constructor(private readonly health: PlatformHealthService) {}

  @Get()
  @Permissions('platform.health:read')
  @ApiOperation({ summary: 'Infra + integration + recent-failure health, in one place' })
  overview() {
    return this.health.overview();
  }
}
