import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const storeSeoSettingsSchema = z.object({
  defaultMetaTitle: z.string().max(255).optional(),
  defaultMetaDescription: z.string().max(500).optional(),
  robotsAllowIndexing: z.boolean().default(true),
  ga4MeasurementId: z
    .string()
    .regex(/^G-[A-Z0-9]+$/, 'Must look like a GA4 measurement id, e.g. G-ABC1234')
    .optional(),
  searchConsoleVerification: z.string().max(255).optional(),
  facebookPixelId: z.string().max(64).optional(),
});
export type StoreSeoSettings = z.infer<typeof storeSeoSettingsSchema>;

export const storeSeoSettingsResponseSchema = storeSeoSettingsSchema.extend({
  storeId: publicIdSchema,
});
export type StoreSeoSettingsResponse = z.infer<typeof storeSeoSettingsResponseSchema>;

// ---------------------------------------------------------------------------
// JSON-LD builders — shapes returned to the storefront to embed verbatim as
// `<script type="application/ld+json">`.
// ---------------------------------------------------------------------------

export const productJsonLdSchema = z.object({
  '@context': z.literal('https://schema.org'),
  '@type': z.literal('Product'),
  name: z.string(),
  image: z.array(z.string()),
  description: z.string().optional(),
  sku: z.string().optional(),
  brand: z.object({ '@type': z.literal('Brand'), name: z.string() }).optional(),
  offers: z.object({
    '@type': z.literal('Offer'),
    url: z.string(),
    priceCurrency: z.string(),
    price: z.string(),
    availability: z.string(),
  }),
  aggregateRating: z
    .object({
      '@type': z.literal('AggregateRating'),
      ratingValue: z.string(),
      reviewCount: z.string(),
    })
    .optional(),
});
export type ProductJsonLd = z.infer<typeof productJsonLdSchema>;

export const breadcrumbJsonLdSchema = z.object({
  '@context': z.literal('https://schema.org'),
  '@type': z.literal('BreadcrumbList'),
  itemListElement: z.array(
    z.object({
      '@type': z.literal('ListItem'),
      position: z.number().int(),
      name: z.string(),
      item: z.string(),
    }),
  ),
});
export type BreadcrumbJsonLd = z.infer<typeof breadcrumbJsonLdSchema>;

export const organizationJsonLdSchema = z.object({
  '@context': z.literal('https://schema.org'),
  '@type': z.literal('Organization'),
  name: z.string(),
  url: z.string(),
  logo: z.string().optional(),
});
export type OrganizationJsonLd = z.infer<typeof organizationJsonLdSchema>;
