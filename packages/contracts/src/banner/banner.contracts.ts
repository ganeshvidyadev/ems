import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const BANNER_PLACEMENTS = ['HOME_HERO', 'HOME_STRIP', 'CATEGORY_TOP', 'SIDEBAR', 'POPUP'] as const;

export const createBannerRequestSchema = z.object({
  storeId: publicIdSchema.optional(),
  placement: z.enum(BANNER_PLACEMENTS),
  title: z.string().max(255).optional(),
  subtitle: z.string().max(500).optional(),
  imageUrl: z.string().url().max(1000).optional(),
  mobileImageUrl: z.string().url().max(1000).optional(),
  altText: z.string().max(255).optional(),
  linkUrl: z.string().max(1000).optional(),
  ctaLabel: z.string().max(64).optional(),
  sortOrder: z.number().int().default(0),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  isActive: z.boolean().default(true),
});
export type CreateBannerRequest = z.infer<typeof createBannerRequestSchema>;

export const updateBannerRequestSchema = createBannerRequestSchema.partial();
export type UpdateBannerRequest = z.infer<typeof updateBannerRequestSchema>;

export const bannerResponseSchema = z.object({
  id: z.string(),
  storeId: publicIdSchema,
  placement: z.enum(BANNER_PLACEMENTS),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  imageUrl: z.string().nullable(),
  mobileImageUrl: z.string().nullable(),
  altText: z.string().nullable(),
  linkUrl: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  sortOrder: z.number().int(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  isActive: z.boolean(),
  isCurrentlyLive: z.boolean(),
  clickCount: z.number().int(),
  createdAt: z.string(),
});
export type BannerResponse = z.infer<typeof bannerResponseSchema>;

export const reorderBannersRequestSchema = z.object({
  placement: z.enum(BANNER_PLACEMENTS),
  orderedIds: z.array(z.string()).min(1),
});
export type ReorderBannersRequest = z.infer<typeof reorderBannersRequestSchema>;
