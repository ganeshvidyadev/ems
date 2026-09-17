import { Module } from '@nestjs/common';
import { PlatformHealthController } from './platform-health.controller';
import { PlatformHealthService } from './platform-health.service';

/**
 * Nothing here needs `@Global()`: unlike `PlatformSettingsModule` (whose service a
 * global guard depends on), nothing outside this module consumes
 * `PlatformHealthService`. Every dependency it reads from (Mongo/Redis/MySQL
 * connections, the integration factories, `MailService`, `LogBufferService`,
 * `QueueRegistry`) is already provided by other `@Global()` modules.
 */
@Module({
  controllers: [PlatformHealthController],
  providers: [PlatformHealthService],
})
export class PlatformHealthModule {}
