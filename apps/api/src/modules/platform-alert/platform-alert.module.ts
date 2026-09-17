import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { PlatformHealthModule } from '../platform-health/platform-health.module';
import { PlatformQuotaModule } from '../platform-quota/platform-quota.module';
import { PlatformAlertController } from './platform-alert.controller';
import { PlatformAlertService } from './platform-alert.service';

@Module({
  imports: [SupportModule, PlatformHealthModule, PlatformQuotaModule],
  controllers: [PlatformAlertController],
  providers: [PlatformAlertService],
})
export class PlatformAlertModule {}
