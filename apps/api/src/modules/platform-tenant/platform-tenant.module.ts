import { Module } from '@nestjs/common';
import { PlatformTenantController } from './platform-tenant.controller';
import { PlatformTenantService } from './platform-tenant.service';

@Module({
  controllers: [PlatformTenantController],
  providers: [PlatformTenantService],
})
export class PlatformTenantModule {}
