import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { PlatformIntegrationService } from './platform-integration.service';

@ApiTags('platform-integrations')
@Controller({ path: 'platform/integrations', version: '1' })
export class PlatformIntegrationController {
  constructor(private readonly integrations: PlatformIntegrationService) {}

  @Get()
  @Permissions('platform.integration:read')
  @ApiOperation({ summary: 'Every tenant\'s marketplace channel connections and their health' })
  overview() {
    return this.integrations.overview();
  }
}
