import { Module } from '@nestjs/common';
import { StorefrontEventController } from './storefront-event.controller';
import { FunnelAnalyticsService } from './funnel-analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  controllers: [StorefrontEventController, AnalyticsController],
  providers: [FunnelAnalyticsService],
})
export class AnalyticsModule {}
