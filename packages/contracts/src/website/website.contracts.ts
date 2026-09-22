import { z } from 'zod';

/**
 * Closed unions rather than free-form strings for icon/colour choices. Tailwind's JIT
 * compiler only generates classes it can see literally in source at build time, so a
 * DB-supplied arbitrary class string would silently render unstyled — both the console
 * editor and the marketing site map these keys to a fixed, literal lookup table instead.
 */
export const WEBSITE_ICON_KEYS = [
  'users',
  'cart',
  'gauge',
  'globe',
  'shield',
  'boxes',
  'zap',
  'lock',
  'rocket',
  'chart',
  'package',
  'star',
] as const;
export type WebsiteIconKey = (typeof WEBSITE_ICON_KEYS)[number];

export const WEBSITE_ACCENT_KEYS = ['indigo', 'fuchsia', 'amber', 'sky', 'emerald', 'rose'] as const;
export type WebsiteAccentKey = (typeof WEBSITE_ACCENT_KEYS)[number];

const linkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  href: z.string().trim().min(1).max(300),
});

export const websiteHeroContentSchema = z.object({
  eyebrow: z.string().trim().max(80).default(''),
  titlePrefix: z.string().trim().max(120),
  titleHighlight: z.string().trim().max(120),
  titleSuffix: z.string().trim().max(120),
  subtitle: z.string().trim().max(500),
  primaryCtaLabel: z.string().trim().min(1).max(60),
  primaryCtaHref: z.string().trim().min(1).max(300),
  secondaryCtaLabel: z.string().trim().max(60).default(''),
  secondaryCtaHref: z.string().trim().max(300).default(''),
});
export type WebsiteHeroContent = z.infer<typeof websiteHeroContentSchema>;

export const websiteFeatureItemSchema = z.object({
  icon: z.enum(WEBSITE_ICON_KEYS),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  accent: z.enum(WEBSITE_ACCENT_KEYS),
});
export type WebsiteFeatureItem = z.infer<typeof websiteFeatureItemSchema>;

export const websiteFeaturesContentSchema = z.object({
  heading: z.string().trim().min(1).max(150),
  subheading: z.string().trim().max(300),
  items: z.array(websiteFeatureItemSchema).max(12),
});
export type WebsiteFeaturesContent = z.infer<typeof websiteFeaturesContentSchema>;

/** Same shape as the home page's feature grid — the Products page is a more detailed
 * listing of the same "icon + title + description" module cards, just its own
 * independently-editable content key. */
export const websiteProductsContentSchema = z.object({
  heading: z.string().trim().min(1).max(150),
  subheading: z.string().trim().max(300),
  items: z.array(websiteFeatureItemSchema).max(12),
});
export type WebsiteProductsContent = z.infer<typeof websiteProductsContentSchema>;

export const websiteHeaderContentSchema = z.object({
  logoText: z.string().trim().min(1).max(40),
  navLinks: z.array(linkSchema).max(8),
  ctaLabel: z.string().trim().min(1).max(60),
  ctaHref: z.string().trim().min(1).max(300),
});
export type WebsiteHeaderContent = z.infer<typeof websiteHeaderContentSchema>;

export const websiteFooterContentSchema = z.object({
  tagline: z.string().trim().max(200).default(''),
  copyrightHolder: z.string().trim().min(1).max(80),
  links: z.array(linkSchema).max(8),
});
export type WebsiteFooterContent = z.infer<typeof websiteFooterContentSchema>;

export const websitePlansDisplayItemSchema = z.object({
  planCode: z.string().trim().min(1).max(64),
  highlighted: z.boolean().default(false),
  accent: z.enum(WEBSITE_ACCENT_KEYS),
});
export type WebsitePlansDisplayItem = z.infer<typeof websitePlansDisplayItemSchema>;

export const websitePlansDisplayContentSchema = z.object({
  heading: z.string().trim().min(1).max(150),
  subheading: z.string().trim().max(300),
  ctaLabel: z.string().trim().min(1).max(60),
  ctaHref: z.string().trim().min(1).max(300),
  items: z.array(websitePlansDisplayItemSchema).max(20),
});
export type WebsitePlansDisplayContent = z.infer<typeof websitePlansDisplayContentSchema>;

export const websiteAboutValueSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
});
export type WebsiteAboutValue = z.infer<typeof websiteAboutValueSchema>;

export const websiteAboutContentSchema = z.object({
  heading: z.string().trim().min(1).max(150),
  subheading: z.string().trim().max(300),
  story: z.array(z.string().trim().min(1).max(1000)).max(10),
  values: z.array(websiteAboutValueSchema).max(12),
});
export type WebsiteAboutContent = z.infer<typeof websiteAboutContentSchema>;

export const websiteCareerOpeningSchema = z.object({
  title: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(80),
  type: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).default(''),
  applyHref: z.string().trim().min(1).max(300),
});
export type WebsiteCareerOpening = z.infer<typeof websiteCareerOpeningSchema>;

export const websiteCareerContentSchema = z.object({
  heading: z.string().trim().min(1).max(150),
  subheading: z.string().trim().max(300),
  openings: z.array(websiteCareerOpeningSchema).max(30),
});
export type WebsiteCareerContent = z.infer<typeof websiteCareerContentSchema>;

export const websiteContactContentSchema = z.object({
  heading: z.string().trim().min(1).max(150),
  subheading: z.string().trim().max(300),
  email: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).default(''),
  address: z.string().trim().max(300).default(''),
  ctaLabel: z.string().trim().min(1).max(60),
  ctaHref: z.string().trim().min(1).max(300),
});
export type WebsiteContactContent = z.infer<typeof websiteContactContentSchema>;

export const websiteContentResponseSchema = z.object({
  hero: websiteHeroContentSchema,
  features: websiteFeaturesContentSchema,
  header: websiteHeaderContentSchema,
  footer: websiteFooterContentSchema,
  plansDisplay: websitePlansDisplayContentSchema,
  about: websiteAboutContentSchema,
  products: websiteProductsContentSchema,
  career: websiteCareerContentSchema,
  contact: websiteContactContentSchema,
});
export type WebsiteContentResponse = z.infer<typeof websiteContentResponseSchema>;

export const updateWebsiteContentRequestSchema = z.object({
  hero: websiteHeroContentSchema.optional(),
  features: websiteFeaturesContentSchema.optional(),
  header: websiteHeaderContentSchema.optional(),
  footer: websiteFooterContentSchema.optional(),
  plansDisplay: websitePlansDisplayContentSchema.optional(),
  about: websiteAboutContentSchema.optional(),
  products: websiteProductsContentSchema.optional(),
  career: websiteCareerContentSchema.optional(),
  contact: websiteContactContentSchema.optional(),
});
export type UpdateWebsiteContentRequest = z.infer<typeof updateWebsiteContentRequestSchema>;
