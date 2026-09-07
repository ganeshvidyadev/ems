import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewStorefrontController } from './review-storefront.controller';
import { ReviewRepository } from './review.repository';
import { ReviewService } from './review.service';

@Module({
  controllers: [ReviewController, ReviewStorefrontController],
  providers: [ReviewRepository, ReviewService],
})
export class ReviewModule {}
