import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  generateReportRequestSchema,
  salesSummaryQuerySchema,
  type GenerateReportResponse,
  type SalesSummaryResponse,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReportService } from './report.service';
import { ReportGenerationService } from './report-generation.service';

@ApiTags('reports')
@Controller({ version: '1' })
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly generation: ReportGenerationService,
  ) {}

  @Get('console/reports/sales-summary')
  @Permissions('report:read')
  @ApiOperation({ summary: 'Sales/revenue/order summary for a date range, from the pre-aggregated daily rollup' })
  async salesSummary(
    @Query(new ZodValidationPipe(salesSummaryQuerySchema)) query: ReturnType<typeof salesSummaryQuerySchema.parse>,
  ): Promise<SalesSummaryResponse> {
    return this.reports.getSalesSummary(query);
  }

  @Post('console/reports/generate')
  @Permissions('report:export')
  @Validate(generateReportRequestSchema)
  @ApiOperation({ summary: 'Kick off an async, exportable report — poll GET console/jobs/:id for the result' })
  async generate(
    @Body() body: ReturnType<typeof generateReportRequestSchema.parse>,
  ): Promise<GenerateReportResponse> {
    return this.generation.enqueue(body);
  }
}
