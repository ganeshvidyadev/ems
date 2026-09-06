import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const CHANNEL_TYPES = [
  'AMAZON',
  'FLIPKART',
  'EBAY',
  'FACEBOOK',
  'INSTAGRAM',
  'WHATSAPP',
  'GOOGLE',
  'STUB',
] as const;

export const CHANNEL_STATUSES = ['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'TOKEN_EXPIRED', 'SUSPENDED'] as const;

export const CHANNEL_LISTING_STATUSES = ['PENDING', 'PUBLISHING', 'LIVE', 'PAUSED', 'REJECTED', 'ERROR', 'DELISTED'] as const;

export const connectChannelRequestSchema = z.object({
  storeId: publicIdSchema,
  type: z.enum(CHANNEL_TYPES),
  name: z.string().trim().min(1).max(120),
});
export type ConnectChannelRequest = z.infer<typeof connectChannelRequestSchema>;

export const connectChannelResponseSchema = z.object({
  channelId: z.string(),
  authorizeUrl: z.string(),
});
export type ConnectChannelResponse = z.infer<typeof connectChannelResponseSchema>;

export const configureChannelRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  inventoryBuffer: z.number().int().min(0).optional(),
  autoPublish: z.boolean().optional(),
  autoImportOrders: z.boolean().optional(),
  settings: z
    .object({
      categoryMapping: z.record(z.string()).optional(),
      priceAdjustmentPercent: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
      priceAdjustmentFlatMinor: z.string().regex(/^-?\d+$/).optional(),
    })
    .optional(),
});
export type ConfigureChannelRequest = z.infer<typeof configureChannelRequestSchema>;

export const channelResponseSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  type: z.enum(CHANNEL_TYPES),
  name: z.string(),
  status: z.enum(CHANNEL_STATUSES),
  externalAccountId: z.string().nullable(),
  marketplaceId: z.string().nullable(),
  inventoryBuffer: z.number(),
  autoPublish: z.boolean(),
  autoImportOrders: z.boolean(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  tokenExpiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ChannelResponse = z.infer<typeof channelResponseSchema>;

export const publishListingRequestSchema = z.object({
  productId: publicIdSchema,
  variantId: publicIdSchema.optional(),
});
export type PublishListingRequest = z.infer<typeof publishListingRequestSchema>;

export const channelListingResponseSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  productId: z.string(),
  variantId: z.string().nullable(),
  externalListingId: z.string().nullable(),
  externalSku: z.string().nullable(),
  status: z.enum(CHANNEL_LISTING_STATUSES),
  channelPriceMinor: z.string().nullable(),
  syncedQuantity: z.number().nullable(),
  lastPublishedAt: z.string().nullable(),
  lastInventorySyncAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type ChannelListingResponse = z.infer<typeof channelListingResponseSchema>;

export const inventoryDriftResponseSchema = z.object({
  listingId: z.string(),
  productId: z.string(),
  channelBelieved: z.number(),
  actual: z.number(),
});

export const syncResultResponseSchema = z.object({
  synced: z.number(),
  failed: z.number(),
  drift: z.array(inventoryDriftResponseSchema),
});
export type SyncResultResponse = z.infer<typeof syncResultResponseSchema>;

export const orderImportResultResponseSchema = z.object({
  imported: z.number(),
  skippedExisting: z.number(),
  nextCursor: z.string().nullable(),
});
export type OrderImportResultResponse = z.infer<typeof orderImportResultResponseSchema>;
