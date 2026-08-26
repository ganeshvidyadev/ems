import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const PRODUCT_MEDIA_TYPES = ['IMAGE', 'VIDEO', 'MODEL_3D', 'DOCUMENT'] as const;
export const PRODUCT_MEDIA_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;

/** Allowlist enforced server-side too — a client-declared MIME is never trusted alone. */
export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
] as const;

export const requestMediaUploadRequestSchema = z.object({
  productId: publicIdSchema,
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_MEDIA_MIME_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024, 'Must be 50 MB or smaller'),
});
export type RequestMediaUploadRequest = z.infer<typeof requestMediaUploadRequestSchema>;

export const requestMediaUploadResponseSchema = z.object({
  /** `product_media.id` — a plain numeric id, not a ULID: this table predates `publicId`. */
  mediaId: z.string(),
  uploadUrl: z.string(),
  storageKey: z.string(),
  expiresInSeconds: z.number(),
});
export type RequestMediaUploadResponse = z.infer<typeof requestMediaUploadResponseSchema>;

export const productMediaResponseSchema = z.object({
  id: z.string(),
  productId: publicIdSchema,
  variantId: z.string().nullable(),
  type: z.enum(PRODUCT_MEDIA_TYPES),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  altText: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  position: z.number(),
  isPrimary: z.boolean(),
  status: z.enum(PRODUCT_MEDIA_STATUSES),
  createdAt: z.string(),
});
export type ProductMediaResponse = z.infer<typeof productMediaResponseSchema>;

export const reorderMediaRequestSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});
export type ReorderMediaRequest = z.infer<typeof reorderMediaRequestSchema>;

export const updateMediaRequestSchema = z.object({
  altText: z.string().trim().max(255).optional(),
  isPrimary: z.boolean().optional(),
});
export type UpdateMediaRequest = z.infer<typeof updateMediaRequestSchema>;
