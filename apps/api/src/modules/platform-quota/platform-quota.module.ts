import { Module } from '@nestjs/common';
import { PlatformQuotaController } from './platform-quota.controller';
import { PlatformQuotaService } from './platform-quota.service';

@Module({
  controllers: [PlatformQuotaController],
  providers: [PlatformQuotaService],
})
export class PlatformQuotaModule {}
