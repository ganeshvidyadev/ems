import type { DataSource } from 'typeorm';
import { ThemeTemplateEntity, type ThemeCategory } from '../entities/theme.entity';

/**
 * The nine theme templates the roadmap names (docs/05 Phase 7). Each
 * `defaultConfig` is what `TenantThemeEntity.config` starts as the moment a
 * merchant clones the template — colors, typography and a homepage section
 * layout, all expressed as the same shape the section-based builder edits.
 */

interface ThemeTemplateSpec {
  code: string;
  name: string;
  category: ThemeCategory;
  description: string;
  isPremium: boolean;
  priceMinor: string;
  defaultConfig: Record<string, unknown>;
}

function baseColors(primary: string, accent: string) {
  return {
    primary,
    secondary: '#1F2937',
    accent,
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    muted: '#6B7280',
  };
}

function baseTypography(headingFont: string, bodyFont = 'Inter') {
  return { headingFont, bodyFont, baseSizePx: 16, scaleRatio: 1.25 };
}

export const THEME_TEMPLATE_SPECS: readonly ThemeTemplateSpec[] = [
  {
    code: 'fashion',
    name: 'Runway',
    category: 'fashion',
    description: 'Full-bleed lookbook imagery and a minimal, editorial feel for apparel and accessories.',
    isPremium: false,
    priceMinor: '0',
    defaultConfig: {
      colors: baseColors('#111827', '#D4A373'),
      typography: baseTypography('Playfair Display'),
      sections: [
        { type: 'hero', settings: { style: 'full-bleed', overlay: true } },
        { type: 'featured_collections', settings: { count: 3 } },
        { type: 'new_arrivals', settings: { count: 8 } },
        { type: 'instagram_feed', settings: { count: 6 } },
        { type: 'newsletter_signup', settings: {} },
      ],
    },
  },
  {
    code: 'electronics',
    name: 'Circuit',
    category: 'electronics',
    description: 'Spec-forward layout with comparison-friendly product grids for gadgets and electronics.',
    isPremium: false,
    priceMinor: '0',
    defaultConfig: {
      colors: baseColors('#2563EB', '#F97316'),
      typography: baseTypography('Roboto'),
      sections: [
        { type: 'hero', settings: { style: 'split', showBadges: true } },
        { type: 'category_grid', settings: { count: 6 } },
        { type: 'best_sellers', settings: { count: 8 } },
        { type: 'deal_countdown', settings: {} },
        { type: 'brand_strip', settings: {} },
      ],
    },
  },
  {
    code: 'grocery',
    name: 'Harvest',
    category: 'grocery',
    description: 'Fast-scanning category tiles and delivery-window messaging for grocery and daily essentials.',
    isPremium: false,
    priceMinor: '0',
    defaultConfig: {
      colors: baseColors('#15803D', '#F59E0B'),
      typography: baseTypography('Nunito'),
      sections: [
        { type: 'hero', settings: { style: 'banner-strip' } },
        { type: 'category_grid', settings: { count: 8 } },
        { type: 'daily_deals', settings: { count: 10 } },
        { type: 'delivery_info', settings: {} },
      ],
    },
  },
  {
    code: 'furniture',
    name: 'Timber',
    category: 'furniture',
    description: 'Room-scene hero imagery and generous whitespace for furniture and home goods.',
    isPremium: true,
    priceMinor: '299900',
    defaultConfig: {
      colors: baseColors('#78350F', '#A16207'),
      typography: baseTypography('Cormorant Garamond'),
      sections: [
        { type: 'hero', settings: { style: 'room-scene' } },
        { type: 'featured_collections', settings: { count: 3 } },
        { type: 'room_inspiration', settings: { count: 4 } },
        { type: 'testimonials', settings: {} },
      ],
    },
  },
  {
    code: 'jewelry',
    name: 'Lumière',
    category: 'jewelry',
    description: 'Dark, luxe palette with large product photography for fine jewelry and accessories.',
    isPremium: true,
    priceMinor: '399900',
    defaultConfig: {
      colors: {
        primary: '#0B0B0F',
        secondary: '#C9A227',
        accent: '#C9A227',
        background: '#0B0B0F',
        surface: '#151519',
        text: '#F5F5F4',
        muted: '#A1A1AA',
      },
      typography: baseTypography('Cormorant Garamond', 'Lato'),
      sections: [
        { type: 'hero', settings: { style: 'full-bleed', dark: true } },
        { type: 'collections_showcase', settings: { count: 3 } },
        { type: 'craftsmanship_story', settings: {} },
        { type: 'testimonials', settings: {} },
      ],
    },
  },
  {
    code: 'pharmacy',
    name: 'Wellness',
    category: 'pharmacy',
    description: 'Trust-forward, accessible layout for pharmacies and health & wellness stores.',
    isPremium: false,
    priceMinor: '0',
    defaultConfig: {
      colors: baseColors('#0891B2', '#22C55E'),
      typography: baseTypography('Source Sans Pro'),
      sections: [
        { type: 'hero', settings: { style: 'banner-strip', trustBadges: true } },
        { type: 'category_grid', settings: { count: 6 } },
        { type: 'prescription_upload_cta', settings: {} },
        { type: 'best_sellers', settings: { count: 8 } },
      ],
    },
  },
  {
    code: 'restaurant',
    name: 'Bistro',
    category: 'restaurant',
    description: 'Menu-first homepage with reservation and delivery calls-to-action for food businesses.',
    isPremium: true,
    priceMinor: '299900',
    defaultConfig: {
      colors: baseColors('#7C2D12', '#EA580C'),
      typography: baseTypography('Playfair Display', 'Poppins'),
      sections: [
        { type: 'hero', settings: { style: 'full-bleed', cta: 'order_now' } },
        { type: 'menu_highlight', settings: { count: 6 } },
        { type: 'reservation_cta', settings: {} },
        { type: 'testimonials', settings: {} },
      ],
    },
  },
  {
    code: 'handmade',
    name: 'Atelier',
    category: 'handmade',
    description: 'Warm, story-led layout for artisans and handmade / craft sellers.',
    isPremium: false,
    priceMinor: '0',
    defaultConfig: {
      colors: baseColors('#92400E', '#D97706'),
      typography: baseTypography('Merriweather'),
      sections: [
        { type: 'hero', settings: { style: 'split' } },
        { type: 'maker_story', settings: {} },
        { type: 'featured_collections', settings: { count: 3 } },
        { type: 'instagram_feed', settings: { count: 6 } },
      ],
    },
  },
  {
    code: 'general',
    name: 'Foundation',
    category: 'general',
    description: 'A clean, category-agnostic starting point suitable for any kind of store.',
    isPremium: false,
    priceMinor: '0',
    defaultConfig: {
      colors: baseColors('#4F46E5', '#F59E0B'),
      typography: baseTypography('Inter'),
      sections: [
        { type: 'hero', settings: { style: 'split' } },
        { type: 'category_grid', settings: { count: 6 } },
        { type: 'best_sellers', settings: { count: 8 } },
        { type: 'newsletter_signup', settings: {} },
      ],
    },
  },
];

/** Idempotent upsert, matched by `code` — the same reasoning `seedPlans` documents for its own upsert. */
export async function seedThemeTemplates(dataSource: DataSource): Promise<number> {
  const repo = dataSource.getRepository(ThemeTemplateEntity);

  for (const spec of THEME_TEMPLATE_SPECS) {
    let template = await repo.findOne({ where: { code: spec.code } });

    if (template) {
      template.name = spec.name;
      template.category = spec.category;
      template.description = spec.description;
      template.isPremium = spec.isPremium;
      template.priceMinor = spec.priceMinor;
      template.defaultConfig = spec.defaultConfig;
      template.status = 'ACTIVE';
    } else {
      template = repo.create({
        code: spec.code,
        name: spec.name,
        category: spec.category,
        description: spec.description,
        isPremium: spec.isPremium,
        priceMinor: spec.priceMinor,
        defaultConfig: spec.defaultConfig,
        status: 'ACTIVE',
      });
    }

    await repo.save(template);
  }

  return THEME_TEMPLATE_SPECS.length;
}
