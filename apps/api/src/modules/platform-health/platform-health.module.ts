import { Module } from '@nestjs/common';
import { PlatformHealthController } from './platform-health.controller';
import { PlatformHealthService } from './platform-health.service';

/**
 * Nothing here needs `@Global()`: unlike `PlatformSettingsModule` (whose service a
 * global guard depends on), nothing app-wide consumes `PlatformHealthService`. Every
 * dependency it reads from (Mongo/Redis/MySQL connections, the integration
 * factories, `MailService`, `LogBufferService`, `QueueRegistry`) is already provided
 * by other `@Global()` modules. It is exported for `PlatformAlertModule`, which
 * reuses its infra-down detection rather than a second copy of those pings.
 */
@Module({
  controllers: [PlatformHealthController],
  providers: [PlatformHealthService],
  exports: [PlatformHealthService],
})
export class PlatformHealthModule {}
