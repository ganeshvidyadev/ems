import { z } from 'zod';
import { publicIdSchema, slugSchema } from '../common/primitives.js';
import { listQuerySchema, sortQuerySchema } from '../common/pagination.js';

export const createBrandRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: slugSchema.optional(),
  logoUrl: z.string().trim().url().max(500).optional(),
  description: z.string().trim().max(10_000).optional(),
  metaTitle: z.string().trim().max(255).optional(),
  metaDescription: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});
export type CreateBrandRequest = z.infer<typeof createBrandRequestSchema>;

export const updateBrandRequestSchema = createBrandRequestSchema.partial();
export type UpdateBrandRequest = z.infer<typeof updateBrandRequestSchema>;

export const brandResponseSchema = z.object({
  id: publicIdSchema,
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrandResponse = z.infer<typeof brandResponseSchema>;

export const brandListQuerySchema = listQuerySchema.extend({
  isActive: z.coerce.boolean().optional(),
  sort: sortQuerySchema(['name', 'createdAt'] as const, [{ field: 'name', direction: 'ASC' }]),
});
