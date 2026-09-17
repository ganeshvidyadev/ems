import { Module } from '@nestjs/common';
import { PlatformQuotaController } from './platform-quota.controller';
import { PlatformQuotaService } from './platform-quota.service';

/** Exported for `PlatformAlertModule`, which reuses this for quota-threshold alerts. */
@Module({
  controllers: [PlatformQuotaController],
  providers: [PlatformQuotaService],
  exports: [PlatformQuotaService],
})
export class PlatformQuotaModule {}
