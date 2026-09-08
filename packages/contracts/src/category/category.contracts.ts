import { z } from 'zod';
import { booleanQuerySchema, publicIdSchema, slugSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const createCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: slugSchema.optional(),
  parentId: publicIdSchema.nullable().optional(),
  storeId: publicIdSchema.optional(),
  description: z.string().trim().max(10_000).optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  bannerUrl: z.string().trim().url().max(500).optional(),
  sortOrder: z.number().int().default(0),
  metaTitle: z.string().trim().max(255).optional(),
  metaDescription: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
  showInMenu: z.boolean().default(true),
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = createCategoryRequestSchema
  .omit({ parentId: true })
  .partial();
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const moveCategoryRequestSchema = z.object({
  parentId: publicIdSchema.nullable(),
});
export type MoveCategoryRequest = z.infer<typeof moveCategoryRequestSchema>;

export const reorderCategoriesRequestSchema = z.object({
  parentId: publicIdSchema.nullable(),
  orderedIds: z.array(publicIdSchema).min(1),
});
export type ReorderCategoriesRequest = z.infer<typeof reorderCategoriesRequestSchema>;

export const categoryResponseSchema = z.object({
  id: publicIdSchema,
  parentId: publicIdSchema.nullable(),
  name: z.string(),
  slug: z.string(),
  path: z.string(),
  depth: z.number(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  sortOrder: z.number(),
  productCount: z.number(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  isActive: z.boolean(),
  showInMenu: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

export type CategoryTreeNode = CategoryResponse & { children: CategoryTreeNode[] };

export const categoryListQuerySchema = listQuerySchema.extend({
  parentId: publicIdSchema.optional(),
  isActive: booleanQuerySchema.optional(),
  sort: sortQuerySchema(['name', 'sortOrder', 'createdAt'] as const, [
    { field: 'sortOrder', direction: 'ASC' },
  ]),
});
