import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { buildPaginationMeta, moderateReviewRequestSchema, replyToReviewRequestSchema, reviewListQuerySchema } from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReviewService } from './review.service';

@ApiTags('reviews')
@Controller({ path: 'console/reviews', version: '1' })
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  @Permissions('review:read')
  @ApiOperation({ summary: 'List reviews for moderation' })
  async list(
    @Query(new ZodValidationPipe(reviewListQuerySchema))
    query: ReturnType<typeof reviewListQuerySchema.parse>,
  ) {
    const { items, total } = await this.reviews.listForModeration({
      page: query.page,
      limit: query.limit,
      productId: query.productId,
      status: query.status,
      sort: query.sort,
    });
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, total));
  }

  @Get(':id')
  @Permissions('review:read')
  @ApiOperation({ summary: 'Get a review' })
  async get(@Param('id') id: string) {
    return this.reviews.getByPublicId(id);
  }

  @Post(':id/moderate')
  @Permissions('review:moderate')
  @Validate(moderateReviewRequestSchema)
  @ApiOperation({ summary: 'Approve, reject, or mark a review as spam' })
  async moderate(@Param('id') id: string, @Body() body: ReturnType<typeof moderateReviewRequestSchema.parse>) {
    return this.reviews.moderate(id, body.status);
  }

  @Post(':id/reply')
  @Permissions('review:reply')
  @Validate(replyToReviewRequestSchema)
  @ApiOperation({ summary: 'Post a merchant reply to a review' })
  async reply(@Param('id') id: string, @Body() body: ReturnType<typeof replyToReviewRequestSchema.parse>) {
    return this.reviews.reply(id, body.reply);
  }

  @Delete(':id')
  @Permissions('review:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a review' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.reviews.remove(id);
  }
}
