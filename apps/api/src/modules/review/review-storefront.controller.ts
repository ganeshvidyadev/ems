import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildPaginationMeta, createReviewRequestSchema, listQuerySchema } from '@ems/contracts';
import { Public, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReviewService } from './review.service';

/**
 * Public. `POST reviews` is deliberately flat, not nested under
 * `products/:productId/reviews` — `createReviewRequestSchema` already
 * carries `productId` in the body, and nesting it under the URL too would
 * mean validating the same thing twice and reconciling a mismatch.
 */
@ApiTags('storefront-reviews')
@Controller({ path: 'storefront', version: '1' })
export class ReviewStorefrontController {
  constructor(private readonly reviews: ReviewService) {}

  @Get('products/:productId/reviews')
  @Public()
  @ApiOperation({ summary: 'Approved reviews for a product' })
  async listForProduct(
    @Param('productId') productId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>,
  ) {
    const { items, total } = await this.reviews.listApprovedForProduct(productId, query.page, query.limit);
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, total));
  }

  @Post('reviews')
  @Public()
  @Validate(createReviewRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a product review' })
  async submit(@Body() body: ReturnType<typeof createReviewRequestSchema.parse>) {
    return this.reviews.submitReview(body);
  }

  @Post('reviews/:id/helpful')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vote a review helpful' })
  async markHelpful(@Param('id') id: string): Promise<void> {
    await this.reviews.markHelpful(id);
  }
}
