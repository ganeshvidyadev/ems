import { Global, Module } from '@nestjs/common';
import { DailySalesRollupRepository } from './daily-sales-rollup.repository';
import { SalesRollupService } from './sales-rollup.service';
import { ReportService } from './report.service';
import { ReportGenerationService } from './report-generation.service';
import { ReportController } from './report.controller';

/**
 * Global — `AnalyticsRollupProcessor` and `ReportGenerationProcessor`
 * (registered in `QueueModule`) inject `SalesRollupService`/`ReportService`
 * with no import edge back, the same pattern `ChannelModule` establishes.
 */
@Global()
@Module({
  controllers: [ReportController],
  providers: [DailySalesRollupRepository, SalesRollupService, ReportService, ReportGenerationService],
  exports: [DailySalesRollupRepository, SalesRollupService, ReportService, ReportGenerationService],
})
export class ReportModule {}
