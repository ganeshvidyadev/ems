import { z } from 'zod';
import { THEME_CATEGORIES, THEME_TEMPLATE_STATUSES, themeSectionSchema } from './theme.contracts.js';

export const themeTemplateConfigSchema = z.object({
  colors: z.record(z.string()).default({}),
  typography: z.record(z.unknown()).default({}),
  sections: z.array(themeSectionSchema).default([]),
});
export type ThemeTemplateConfig = z.infer<typeof themeTemplateConfigSchema>;

export const createThemeTemplateRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
  name: z.string().trim().min(2).max(120),
  category: z.enum(THEME_CATEGORIES),
  description: z.string().trim().max(2000).optional(),
  previewUrl: z.string().trim().max(500).optional(),
  thumbnailUrl: z.string().trim().max(500).optional(),
  demoUrl: z.string().trim().max(500).optional(),
  isPremium: z.boolean().default(false),
  priceMinor: z.string().regex(/^\d+$/, 'Minor units — a whole non-negative integer').default('0'),
  /** A tenant's plan unlocks this template when its `sortOrder` is at or past this plan's — resolved server-side, never the internal plan id. */
  minPlanCode: z.string().trim().optional(),
  defaultConfig: themeTemplateConfigSchema.default({ colors: {}, typography: {}, sections: [] }),
});
export type CreateThemeTemplateRequest = z.infer<typeof createThemeTemplateRequestSchema>;

export const updateThemeTemplateRequestSchema = createThemeTemplateRequestSchema.omit({ code: true }).partial();
export type UpdateThemeTemplateRequest = z.infer<typeof updateThemeTemplateRequestSchema>;

export const platformThemeTemplateResponseSchema = z.object({
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
  minPlanCode: z.string().nullable(),
  defaultConfig: themeTemplateConfigSchema,
  status: z.enum(THEME_TEMPLATE_STATUSES),
  /** Live stores currently cloned from this template — context before archiving/deleting it. */
  usageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlatformThemeTemplateResponse = z.infer<typeof platformThemeTemplateResponseSchema>;
