import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SPAM'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Storefront-facing: a shopper reviewing a product.
 *
 * `customerId`/`orderItemId` are client-supplied, not derived from an
 * authenticated session — the storefront has no customer auth implemented
 * yet (checkout itself is guest-only, capturing an email ad-hoc), so this
 * matches every other storefront-facing schema's current trust level rather
 * than inventing a stronger guarantee nothing else in the API has. Given
 * `orderItemId`, the service still verifies it actually belongs to that
 * product/customer before granting the verified-purchase badge — a mismatch
 * is rejected outright rather than silently downgraded, since a well-behaved
 * client only ever passes an id it read back from its own order.
 */
export const createReviewRequestSchema = z.object({
  productId: publicIdSchema,
  customerId: publicIdSchema.optional(),
  orderItemId: z.string().trim().min(1).optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(255).optional(),
  body: z.string().trim().max(5000).optional(),
  authorName: z.string().trim().max(120).optional(),
  images: z.array(z.string().url()).max(6).optional(),
});
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

export const reviewResponseSchema = z.object({
  id: publicIdSchema,
  productId: publicIdSchema,
  customerId: publicIdSchema.nullable(),
  rating: z.number().int(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  authorName: z.string().nullable(),
  images: z.array(z.string()).nullable(),
  status: z.enum(REVIEW_STATUSES),
  isVerifiedPurchase: z.boolean(),
  helpfulCount: z.number().int(),
  merchantReply: z.string().nullable(),
  merchantRepliedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export const reviewListQuerySchema = listQuerySchema.extend({
  productId: publicIdSchema.optional(),
  status: z.enum(REVIEW_STATUSES).optional(),
  sort: sortQuerySchema(['createdAt', 'rating', 'helpfulCount'] as const, [
    { field: 'createdAt', direction: 'DESC' },
  ]),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

/** Console-facing: approve/reject/spam. Never back to PENDING — that's only ever the initial state. */
export const moderateReviewRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SPAM']),
});
export type ModerateReviewRequest = z.infer<typeof moderateReviewRequestSchema>;

export const replyToReviewRequestSchema = z.object({
  reply: z.string().trim().min(1).max(5000),
});
export type ReplyToReviewRequest = z.infer<typeof replyToReviewRequestSchema>;
