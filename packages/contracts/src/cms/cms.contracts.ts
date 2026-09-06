import { z } from 'zod';
import { publicIdSchema, slugSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const CMS_PAGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export const createCmsPageRequestSchema = z.object({
  storeId: publicIdSchema.optional(),
  slug: slugSchema,
  title: z.string().trim().min(1).max(255),
  contentHtml: z.string().max(500_000).optional(),
  contentBlocks: z.array(z.record(z.unknown())).optional(),
  template: z.string().max(64).optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  canonicalUrl: z.string().url().max(500).optional(),
  noIndex: z.boolean().default(false),
});
export type CreateCmsPageRequest = z.infer<typeof createCmsPageRequestSchema>;

export const updateCmsPageRequestSchema = createCmsPageRequestSchema.partial().extend({
  status: z.enum(CMS_PAGE_STATUSES).optional(),
});
export type UpdateCmsPageRequest = z.infer<typeof updateCmsPageRequestSchema>;

export const cmsPageResponseSchema = z.object({
  id: publicIdSchema,
  storeId: publicIdSchema,
  slug: z.string(),
  title: z.string(),
  contentHtml: z.string().nullable(),
  contentBlocks: z.array(z.record(z.unknown())).nullable(),
  template: z.string().nullable(),
  status: z.enum(CMS_PAGE_STATUSES),
  isSystem: z.boolean(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  noIndex: z.boolean(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CmsPageResponse = z.infer<typeof cmsPageResponseSchema>;

export const cmsPageListQuerySchema = listQuerySchema.extend({
  storeId: publicIdSchema.optional(),
  status: z.enum(CMS_PAGE_STATUSES).optional(),
  sort: sortQuerySchema(['title', 'createdAt', 'publishedAt'] as const),
});

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

export const BLOG_POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export const createBlogPostRequestSchema = z.object({
  storeId: publicIdSchema.optional(),
  slug: slugSchema,
  title: z.string().trim().min(1).max(255),
  excerpt: z.string().max(1000).optional(),
  contentHtml: z.string().max(500_000).optional(),
  coverImageUrl: z.string().url().max(1000).optional(),
  authorName: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
});
export type CreateBlogPostRequest = z.infer<typeof createBlogPostRequestSchema>;

export const updateBlogPostRequestSchema = createBlogPostRequestSchema.partial().extend({
  status: z.enum(BLOG_POST_STATUSES).optional(),
});
export type UpdateBlogPostRequest = z.infer<typeof updateBlogPostRequestSchema>;

export const blogPostResponseSchema = z.object({
  id: publicIdSchema,
  storeId: publicIdSchema,
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  contentHtml: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  authorName: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  status: z.enum(BLOG_POST_STATUSES),
  viewCount: z.number().int(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BlogPostResponse = z.infer<typeof blogPostResponseSchema>;

export const blogPostListQuerySchema = listQuerySchema.extend({
  storeId: publicIdSchema.optional(),
  status: z.enum(BLOG_POST_STATUSES).optional(),
  category: z.string().max(120).optional(),
  sort: sortQuerySchema(['title', 'createdAt', 'publishedAt'] as const, [
    { field: 'publishedAt', direction: 'DESC' },
  ]),
});
