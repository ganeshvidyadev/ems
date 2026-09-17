import { z } from 'zod';

export const PLATFORM_SEARCH_CATEGORIES = ['tenant', 'supportTicket', 'invoice', 'platformStaff'] as const;
export type PlatformSearchCategory = (typeof PLATFORM_SEARCH_CATEGORIES)[number];

export const platformSearchResultSchema = z.object({
  category: z.enum(PLATFORM_SEARCH_CATEGORIES),
  id: z.string(),
  label: z.string(),
  sublabel: z.string().nullable(),
  href: z.string(),
});
export type PlatformSearchResult = z.infer<typeof platformSearchResultSchema>;

export const platformSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});
export type PlatformSearchQuery = z.infer<typeof platformSearchQuerySchema>;

export const platformSearchResponseSchema = z.object({
  results: z.array(platformSearchResultSchema),
});
export type PlatformSearchResponse = z.infer<typeof platformSearchResponseSchema>;
