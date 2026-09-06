import { z } from 'zod';

export const STOREFRONT_EVENT_TYPES = [
  'PAGE_VIEW',
  'PRODUCT_VIEW',
  'ADD_TO_CART',
  'CHECKOUT_STEP',
  'PURCHASE',
  'SEARCH',
] as const;
export type StorefrontEventType = (typeof STOREFRONT_EVENT_TYPES)[number];

export const trackStorefrontEventRequestSchema = z.object({
  type: z.enum(STOREFRONT_EVENT_TYPES),
  storeId: z.string(),
  sessionId: z.string().max(64),
  path: z.string().max(2000).optional(),
  productId: z.string().optional(),
  checkoutStep: z.string().max(64).optional(),
  searchQuery: z.string().max(500).optional(),
  resultCount: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type TrackStorefrontEventRequest = z.infer<typeof trackStorefrontEventRequestSchema>;

export const funnelQuerySchema = z.object({
  storeId: z.string(),
  from: z.string().date(),
  to: z.string().date(),
});
export type FunnelQuery = z.infer<typeof funnelQuerySchema>;

export const funnelResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  steps: z.array(
    z.object({
      type: z.enum(STOREFRONT_EVENT_TYPES),
      sessions: z.number(),
      dropOffPercent: z.number().nullable(),
    }),
  ),
});
export type FunnelResponse = z.infer<typeof funnelResponseSchema>;

export const topSearchQueriesResponseSchema = z.array(
  z.object({ query: z.string(), count: z.number(), avgResultCount: z.number() }),
);
