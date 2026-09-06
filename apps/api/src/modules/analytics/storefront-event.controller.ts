import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { trackStorefrontEventRequestSchema, type TrackStorefrontEventRequest } from '@ems/contracts';
import { Public } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LogBufferService } from '../logging/log-buffer.service';

/**
 * Storefront analytics collector — public and fire-and-forget, the same
 * contract `LogBufferService.enqueue` already guarantees: a slow or failing
 * Mongo write must never slow down or fail the shopper's page.
 */
@ApiTags('analytics')
@Controller({ version: '1' })
export class StorefrontEventController {
  constructor(private readonly logBuffer: LogBufferService) {}

  @Post('storefront/events')
  @Public()
  @ApiOperation({ summary: 'Record one storefront funnel/search event' })
  track(@Body(new ZodValidationPipe(trackStorefrontEventRequestSchema)) body: TrackStorefrontEventRequest): { accepted: true } {
    const now = new Date();

    this.logBuffer.enqueue('storefront_events', {
      type: body.type,
      storeId: body.storeId,
      sessionId: body.sessionId,
      path: body.path ?? null,
      productId: body.productId ?? null,
      checkoutStep: body.checkoutStep ?? null,
      metadata: body.metadata ?? null,
      createdAt: now,
    });

    if (body.type === 'SEARCH' && body.searchQuery) {
      this.logBuffer.enqueue('search_queries', {
        storeId: body.storeId,
        query: body.searchQuery,
        resultCount: body.resultCount ?? null,
        createdAt: now,
      });
    }

    return { accepted: true };
  }
}
