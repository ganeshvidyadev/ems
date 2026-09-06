import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { funnelQuerySchema, type FunnelResponse } from '@ems/contracts';
import { Permissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FunnelAnalyticsService } from './funnel-analytics.service';

@ApiTags('analytics')
@Controller({ version: '1' })
export class AnalyticsController {
  constructor(private readonly funnel: FunnelAnalyticsService) {}

  @Get('console/analytics/funnel')
  @Permissions('analytics:read')
  @ApiOperation({ summary: 'Storefront conversion funnel with per-step drop-off for a date range' })
  async getFunnel(@Query(new ZodValidationPipe(funnelQuerySchema)) query: ReturnType<typeof funnelQuerySchema.parse>): Promise<FunnelResponse> {
    return this.funnel.getFunnel(query);
  }

  @Get('console/analytics/search-queries')
  @Permissions('analytics:read')
  @ApiOperation({ summary: "Storefront search terms, ranked by volume, for a date range" })
  async getTopSearchQueries(@Query(new ZodValidationPipe(funnelQuerySchema)) query: ReturnType<typeof funnelQuerySchema.parse>) {
    return this.funnel.getTopSearchQueries(query.storeId, query.from, query.to);
  }
}
