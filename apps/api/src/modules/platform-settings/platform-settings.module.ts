import { Global, Module } from '@nestjs/common';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * `@Global()` because `MaintenanceModeGuard` (registered app-wide via
 * `APP_GUARD`) depends on `PlatformSettingsService` — same reasoning as
 * `AuthModule`/`SubscriptionModule` for their own globally-registered guards.
 */
@Global()
@Module({
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
