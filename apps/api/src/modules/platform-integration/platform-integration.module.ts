import { Module } from '@nestjs/common';
import { PlatformIntegrationController } from './platform-integration.controller';
import { PlatformIntegrationService } from './platform-integration.service';

@Module({
  controllers: [PlatformIntegrationController],
  providers: [PlatformIntegrationService],
})
export class PlatformIntegrationModule {}
