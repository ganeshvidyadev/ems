import { z } from 'zod';
import { publicIdSchema } from '../common/primitives.js';

export const THEME_CATEGORIES = [
  'fashion',
  'electronics',
  'grocery',
  'furniture',
  'jewelry',
  'pharmacy',
  'restaurant',
  'handmade',
  'general',
] as const;

export const THEME_TEMPLATE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const TENANT_THEME_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export const themeTemplateResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.enum(THEME_CATEGORIES),
  description: z.string().nullable(),
  previewUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  demoUrl: z.string().nullable(),
  isPremium: z.boolean(),
  priceMinor: z.string(),
  status: z.enum(THEME_TEMPLATE_STATUSES),
  /** Set only when the requesting tenant's plan doesn't unlock this template. */
  locked: z.boolean().optional(),
});
export type ThemeTemplateResponse = z.infer<typeof themeTemplateResponseSchema>;

export const cloneThemeRequestSchema = z.object({
  storeId: publicIdSchema,
  templateCode: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120).optional(),
});
export type CloneThemeRequest = z.infer<typeof cloneThemeRequestSchema>;

export const themeSectionSchema = z.object({
  type: z.string().min(1).max(64),
  settings: z.record(z.unknown()).default({}),
});
export type ThemeSection = z.infer<typeof themeSectionSchema>;

export const updateThemeConfigRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  colors: z.record(z.string()).optional(),
  typography: z.record(z.unknown()).optional(),
  sections: z.array(themeSectionSchema).optional(),
});
export type UpdateThemeConfigRequest = z.infer<typeof updateThemeConfigRequestSchema>;

export const updateThemeCustomCodeRequestSchema = z.object({
  customCss: z.string().max(100_000).nullable().optional(),
  customHeadHtml: z.string().max(50_000).nullable().optional(),
});
export type UpdateThemeCustomCodeRequest = z.infer<typeof updateThemeCustomCodeRequestSchema>;

export const tenantThemeResponseSchema = z.object({
  id: publicIdSchema,
  storeId: publicIdSchema,
  templateCode: z.string(),
  name: z.string(),
  config: z.record(z.unknown()),
  customCss: z.string().nullable(),
  customHeadHtml: z.string().nullable(),
  status: z.enum(TENANT_THEME_STATUSES),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantThemeResponse = z.infer<typeof tenantThemeResponseSchema>;

/** What the storefront actually renders — always the published snapshot, never the draft. */
export const liveThemeResponseSchema = z.object({
  templateCode: z.string(),
  name: z.string(),
  config: z.record(z.unknown()),
  customCss: z.string().nullable(),
  customHeadHtml: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type LiveThemeResponse = z.infer<typeof liveThemeResponseSchema>;
