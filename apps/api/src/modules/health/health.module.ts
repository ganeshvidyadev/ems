import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsRegistry } from './metrics.registry';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [MetricsRegistry],
  // Exported so `HttpMetricsInterceptor` (registered via `APP_INTERCEPTOR`
  // in `app.module.ts`, which imports this module) can inject the same
  // registry `MetricsController` scrapes — one registry, not one per consumer.
  exports: [MetricsRegistry],
})
export class HealthModule {}
