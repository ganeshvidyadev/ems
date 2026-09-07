import { Injectable } from '@nestjs/common';
import type { CreateReviewRequest, ReviewResponse, ReviewStatus as ReviewStatusContract } from '@ems/contracts';
import { BusinessRuleError } from '@ems/kernel';
import { RequestContextService } from '../../common/services/request-context.service';
import type { ReviewEntity, ReviewStatus } from '../../database/entities';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { CustomerRepository } from '../customer/customer.repository';
import { ProductRepository } from '../product/product.repository';
import { ReviewRepository } from './review.repository';

@Injectable()
export class ReviewService {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly products: ProductRepository,
    private readonly customers: CustomerRepository,
    private readonly context: RequestContextService,
  ) {}

  // =========================================================================
  // Storefront
  // =========================================================================

  async submitReview(input: CreateReviewRequest): Promise<ReviewResponse> {
    const product = await this.products.findByPublicIdOrFail(input.productId);

    let customerId: string | null = null;
    if (input.customerId) {
      customerId = (await this.customers.findByPublicIdOrFail(input.customerId)).id;
    }

    let isVerifiedPurchase = false;
    if (input.orderItemId) {
      if (!customerId) {
        throw new BusinessRuleError('A customer is required to verify a purchase');
      }
      const belongs = await this.reviews.orderItemBelongsTo(input.orderItemId, product.id, customerId);
      if (!belongs) {
        throw new BusinessRuleError('This order item does not belong to this customer and product');
      }
      isVerifiedPurchase = true;
    }

    const saved = await this.reviews.insert({
      storeId: product.storeId,
      productId: product.id,
      customerId,
      orderItemId: input.orderItemId ?? null,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body ?? null,
      authorName: input.authorName ?? null,
      images: input.images ?? null,
      status: 'PENDING',
      isVerifiedPurchase,
    });

    // Every new review starts PENDING, which never counts toward the public
    // rating — no recompute needed here, only once a moderator approves it.
    return this.toResponse(saved, input.productId, input.customerId ?? null);
  }

  async listApprovedForProduct(
    productPublicId: string,
    page: number,
    limit: number,
  ): Promise<{ items: ReviewResponse[]; total: number }> {
    const product = await this.products.findByPublicIdOrFail(productPublicId);
    const { items, total } = await this.reviews.listApprovedForProduct(product.id, page, limit);
    return { items: await this.toResponses(items, productPublicId), total };
  }

  async markHelpful(publicId: string): Promise<void> {
    const applied = await this.reviews.incrementHelpfulByPublicId(publicId);
    if (!applied) throw new BusinessRuleError('This review cannot be voted on');
  }

  // =========================================================================
  // Console moderation
  // =========================================================================

  async listForModeration(query: {
    page: number;
    limit: number;
    productId?: string;
    status?: ReviewStatusContract;
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<{ items: ReviewResponse[]; total: number }> {
    const internalProductId = query.productId ? (await this.products.findByPublicIdOrFail(query.productId)).id : undefined;

    const { items, total } = await this.reviews.listForModeration({
      productId: internalProductId,
      status: query.status,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });

    return { items: await this.toResponses(items), total };
  }

  async getByPublicId(publicId: string): Promise<ReviewResponse> {
    const review = await this.reviews.findByPublicIdOrFail(publicId);
    return (await this.toResponses([review]))[0];
  }

  async moderate(publicId: string, status: Extract<ReviewStatus, 'APPROVED' | 'REJECTED' | 'SPAM'>): Promise<ReviewResponse> {
    const review = await this.reviews.findByPublicIdOrFail(publicId);
    review.status = status;
    review.moderatedBy = this.context.userId;
    review.moderatedAt = new Date();
    const saved = (await this.reviews.save(review)) as ReviewEntity;

    // The approved set changed either way (a review entered or left it), so
    // the product's public rating_average/rating_count need recomputing.
    await this.recomputeProductRating(saved.productId);

    return (await this.toResponses([saved]))[0];
  }

  async reply(publicId: string, reply: string): Promise<ReviewResponse> {
    const review = await this.reviews.findByPublicIdOrFail(publicId);
    review.merchantReply = reply;
    review.merchantRepliedAt = new Date();
    const saved = (await this.reviews.save(review)) as ReviewEntity;
    return (await this.toResponses([saved]))[0];
  }

  async remove(publicId: string): Promise<void> {
    const review = await this.reviews.findByPublicIdOrFail(publicId);
    await this.reviews.softDeleteByPublicId(publicId);
    if (review.status === 'APPROVED') {
      await this.recomputeProductRating(review.productId);
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async recomputeProductRating(productId: string): Promise<void> {
    const { average, count } = await this.reviews.ratingAggregate(productId);
    await this.products.update({ id: productId }, { ratingAverage: average, ratingCount: count });
  }

  private async toResponse(review: ReviewEntity, productPublicId: string, customerPublicId: string | null): Promise<ReviewResponse> {
    return {
      id: review.publicId,
      productId: productPublicId,
      customerId: customerPublicId,
      rating: review.rating,
      title: review.title,
      body: review.body,
      authorName: review.authorName,
      images: review.images,
      status: review.status,
      isVerifiedPurchase: review.isVerifiedPurchase,
      helpfulCount: review.helpfulCount,
      merchantReply: review.merchantReply,
      merchantRepliedAt: review.merchantRepliedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
    };
  }

  /**
   * Batch id resolution for a list of reviews that may span several products
   * and customers — `knownProductPublicId` skips the lookup when every row
   * already shares one product (the storefront's per-product list).
   */
  private async toResponses(reviews: ReviewEntity[], knownProductPublicId?: string): Promise<ReviewResponse[]> {
    const productPublicIds = knownProductPublicId
      ? new Map<string, string>()
      : await this.reviews.publicIdsFor('products', reviews.map((r) => r.productId));
    const customerPublicIds = await this.reviews.publicIdsFor(
      'customers',
      reviews.map((r) => r.customerId).filter((id): id is string => id !== null),
    );

    return Promise.all(
      reviews.map((review) =>
        this.toResponse(
          review,
          knownProductPublicId ?? productPublicIds.get(review.productId) ?? review.productId,
          review.customerId ? (customerPublicIds.get(review.customerId) ?? review.customerId) : null,
        ),
      ),
    );
  }
}
