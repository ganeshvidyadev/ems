import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import type {
  BreadcrumbJsonLd,
  OrganizationJsonLd,
  ProductJsonLd,
  StoreSeoSettings,
  StoreSeoSettingsResponse,
} from '@ems/contracts';
import { ConflictError } from '@ems/kernel';
import { CacheService } from '../../common/services/cache.service';
import { RequestContextService } from '../../common/services/request-context.service';
import { SeoSettingsRepository } from './seo-settings.repository';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
}

@Injectable()
export class SeoService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly settings: SeoSettingsRepository,
    private readonly cache: CacheService,
    private readonly context: RequestContextService,
  ) {}

  async getSettings(storePublicId: string): Promise<StoreSeoSettingsResponse> {
    const storeId = await this.mustResolveStore(storePublicId);
    const raw = await this.settings.getAll(storeId);
    return {
      storeId: storePublicId,
      defaultMetaTitle: raw.defaultMetaTitle as string | undefined,
      defaultMetaDescription: raw.defaultMetaDescription as string | undefined,
      robotsAllowIndexing: (raw.robotsAllowIndexing as boolean | undefined) ?? true,
      ga4MeasurementId: raw.ga4MeasurementId as string | undefined,
      searchConsoleVerification: raw.searchConsoleVerification as string | undefined,
      facebookPixelId: raw.facebookPixelId as string | undefined,
    };
  }

  async updateSettings(storePublicId: string, input: StoreSeoSettings): Promise<StoreSeoSettingsResponse> {
    const storeId = await this.mustResolveStore(storePublicId);
    await this.settings.setMany(storeId, input);
    await this.cache.invalidate('settings');
    return this.getSettings(storePublicId);
  }

  // =========================================================================
  // Sitemap & robots
  // =========================================================================

  /** `urlset` XML for every published product, category, CMS page and blog post — one sitemap per tenant/store. */
  async generateSitemap(storePublicId: string): Promise<string> {
    return this.cache.wrap('home', `sitemap:${storePublicId}`, async () => {
      const storeId = await this.mustResolveStore(storePublicId);
      const hostname = (await this.settings.primaryHostname(storeId)) ?? `${storePublicId}.example.com`;
      const base = `https://${hostname}`;

      const urls: SitemapUrl[] = [{ loc: base, changefreq: 'daily', priority: 1.0 }];

      const [products, categories, pages, posts] = await Promise.all([
        this.manager.query(
          `SELECT slug, updated_at AS updatedAt FROM products
            WHERE tenant_id = ? AND store_id = ? AND status = 'ACTIVE' AND visibility = 'VISIBLE' AND deleted_at IS NULL`,
          [this.context.requireTenantId('sitemap'), storeId],
        ) as Promise<{ slug: string; updatedAt: Date }[]>,
        this.manager.query(
          `SELECT slug, updated_at AS updatedAt FROM categories
            WHERE tenant_id = ? AND (store_id = ? OR store_id IS NULL) AND is_active = 1 AND deleted_at IS NULL`,
          [this.context.requireTenantId('sitemap'), storeId],
        ) as Promise<{ slug: string; updatedAt: Date }[]>,
        this.manager.query(
          `SELECT slug, updated_at AS updatedAt FROM cms_pages
            WHERE tenant_id = ? AND store_id = ? AND status = 'PUBLISHED' AND no_index = 0 AND deleted_at IS NULL`,
          [this.context.requireTenantId('sitemap'), storeId],
        ) as Promise<{ slug: string; updatedAt: Date }[]>,
        this.manager.query(
          `SELECT slug, updated_at AS updatedAt FROM blog_posts
            WHERE tenant_id = ? AND store_id = ? AND status = 'PUBLISHED' AND deleted_at IS NULL`,
          [this.context.requireTenantId('sitemap'), storeId],
        ) as Promise<{ slug: string; updatedAt: Date }[]>,
      ]);

      for (const p of products) {
        urls.push({ loc: `${base}/products/${p.slug}`, lastmod: isoDate(p.updatedAt), changefreq: 'weekly', priority: 0.8 });
      }
      for (const c of categories) {
        urls.push({ loc: `${base}/categories/${c.slug}`, lastmod: isoDate(c.updatedAt), changefreq: 'weekly', priority: 0.6 });
      }
      for (const page of pages) {
        urls.push({ loc: `${base}/${page.slug}`, lastmod: isoDate(page.updatedAt), changefreq: 'monthly', priority: 0.4 });
      }
      for (const post of posts) {
        urls.push({ loc: `${base}/blog/${post.slug}`, lastmod: isoDate(post.updatedAt), changefreq: 'monthly', priority: 0.5 });
      }

      return toSitemapXml(urls);
    });
  }

  async generateRobotsTxt(storePublicId: string): Promise<string> {
    const settings = await this.getSettings(storePublicId);
    const storeId = await this.mustResolveStore(storePublicId);
    const hostname = (await this.settings.primaryHostname(storeId)) ?? `${storePublicId}.example.com`;

    if (!settings.robotsAllowIndexing) {
      return 'User-agent: *\nDisallow: /\n';
    }

    return [
      'User-agent: *',
      'Disallow: /console/',
      'Disallow: /api/',
      'Allow: /',
      '',
      `Sitemap: https://${hostname}/sitemap.xml`,
      '',
    ].join('\n');
  }

  // =========================================================================
  // JSON-LD builders
  // =========================================================================

  buildProductJsonLd(input: {
    name: string;
    description?: string;
    images: string[];
    sku?: string;
    brandName?: string;
    url: string;
    priceMinor: string;
    currency: string;
    inStock: boolean;
    ratingAverage?: string;
    ratingCount?: number;
  }): ProductJsonLd {
    const jsonLd: ProductJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: input.name,
      image: input.images,
      description: input.description,
      sku: input.sku,
      brand: input.brandName ? { '@type': 'Brand', name: input.brandName } : undefined,
      offers: {
        '@type': 'Offer',
        url: input.url,
        priceCurrency: input.currency,
        price: toMajorUnitsString(input.priceMinor),
        availability: input.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      },
      aggregateRating:
        input.ratingCount && input.ratingCount > 0
          ? {
              '@type': 'AggregateRating',
              ratingValue: input.ratingAverage ?? '0',
              reviewCount: String(input.ratingCount),
            }
          : undefined,
    };
    return jsonLd;
  }

  buildBreadcrumbJsonLd(items: { name: string; url: string }[]): BreadcrumbJsonLd {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    };
  }

  buildOrganizationJsonLd(input: { name: string; url: string; logo?: string }): OrganizationJsonLd {
    return { '@context': 'https://schema.org', '@type': 'Organization', name: input.name, url: input.url, logo: input.logo };
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    const storeId = await this.settings.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }
}

function isoDate(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

function toMajorUnitsString(minor: string): string {
  const negative = minor.startsWith('-');
  const digits = negative ? minor.slice(1) : minor;
  const padded = digits.padStart(3, '0');
  const value = `${padded.slice(0, -2)}.${padded.slice(-2)}`;
  return negative ? `-${value}` : value;
}

function toSitemapXml(urls: SitemapUrl[]): string {
  const entries = urls
    .map((u) => {
      const parts = [`<loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`<lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`<priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
