import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  UpdateWebsiteContentRequest,
  WebsiteAboutContent,
  WebsiteCareerContent,
  WebsiteContactContent,
  WebsiteContentResponse,
  WebsiteFeaturesContent,
  WebsiteFooterContent,
  WebsiteHeaderContent,
  WebsiteHeroContent,
  WebsitePlansDisplayContent,
  WebsiteProductsContent,
} from '@ems/contracts';
import { CacheService } from '../../common/services/cache.service';
import { WebsiteContentEntity, type WebsiteContentKey } from '../../database/entities';

// Defaults mirror the marketing site's copy as it shipped in commit c9e39aa, so the
// table starts identical to what's already live — no separate data migration needed.
const DEFAULT_HERO: WebsiteHeroContent = {
  eyebrow: '',
  titlePrefix: 'The',
  titleHighlight: 'multi-tenant e-commerce platform',
  titleSuffix: 'behind your store',
  subtitle:
    'Merchants sign up, pick a plan, and get a fully provisioned online store — payments, ' +
    'logistics, a website builder, and multi-channel selling, all in one platform.',
  primaryCtaLabel: 'Request access',
  primaryCtaHref: 'mailto:hello@ems.app',
  secondaryCtaLabel: "See what's inside →",
  secondaryCtaHref: '#features',
};

const DEFAULT_FEATURES: WebsiteFeaturesContent = {
  heading: 'Everything a modern storefront needs',
  subheading: "Built as a single platform so merchants don't have to stitch together separate tools.",
  items: [
    {
      icon: 'users',
      title: 'True multi-tenant isolation',
      description:
        "Every merchant's data, users, and stores are scoped and isolated at the platform level, enforced consistently across every service.",
      accent: 'indigo',
    },
    {
      icon: 'cart',
      title: 'Storefront & website builder',
      description:
        'Merchants get a fully provisioned, brandable online store out of the box — no separate hosting or setup required.',
      accent: 'fuchsia',
    },
    {
      icon: 'gauge',
      title: 'Plans, billing & quotas',
      description:
        'Flexible pricing tiers with usage limits on products, orders, staff, and storage — upgrade or downgrade without downtime.',
      accent: 'amber',
    },
    {
      icon: 'globe',
      title: 'Multi-channel selling',
      description: 'Connect sales channels and manage orders, inventory, and fulfillment from a single place.',
      accent: 'sky',
    },
    {
      icon: 'shield',
      title: 'Admin control plane',
      description:
        'A dedicated super-admin console for platform health monitoring, tenant support, audited impersonation, and security policy.',
      accent: 'emerald',
    },
    {
      icon: 'boxes',
      title: 'Supplier & reseller marketplace',
      description: 'An internal marketplace connecting suppliers and resellers directly into the merchant catalog.',
      accent: 'rose',
    },
  ],
};

const DEFAULT_HEADER: WebsiteHeaderContent = {
  logoText: 'EMS',
  navLinks: [
    { label: 'Products', href: '/products' },
    { label: 'Plans', href: '/plans' },
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  ctaLabel: 'Get in touch',
  ctaHref: 'mailto:hello@ems.app',
};

const DEFAULT_FOOTER: WebsiteFooterContent = {
  tagline: '',
  copyrightHolder: 'EMS',
  links: [
    { label: 'Products', href: '/products' },
    { label: 'Plans', href: '/plans' },
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
};

const DEFAULT_PLANS_DISPLAY: WebsitePlansDisplayContent = {
  heading: 'Plans that grow with you',
  subheading: 'Illustrative pricing — contact us for a plan tailored to your business.',
  ctaLabel: 'Get in touch',
  ctaHref: 'mailto:hello@ems.app',
  items: [],
};

const DEFAULT_ABOUT: WebsiteAboutContent = {
  heading: 'About EMS',
  subheading: 'Built by a team that has run e-commerce operations, not just software.',
  story: [
    'EMS started as an internal tool for running multi-brand e-commerce operations, before becoming the ' +
      'platform other merchants now run their stores on.',
    "We believe a merchant shouldn't need five different vendors to sell online — a store, payments, " +
      'logistics, and multi-channel selling should be one platform, not a pile of integrations.',
  ],
  values: [
    { title: 'Merchant-first', description: 'Every feature ships because a real merchant asked for it.' },
    { title: 'Reliable by default', description: 'Isolation, backups, and audit trails are not add-ons.' },
    { title: 'Move fast, stay honest', description: 'Transparent pricing and no dark patterns, ever.' },
  ],
};

const DEFAULT_PRODUCTS: WebsiteProductsContent = {
  heading: 'One platform, every part of the store',
  subheading: 'Everything a merchant needs to launch, run, and grow — built to work together from day one.',
  items: [
    {
      icon: 'cart',
      title: 'Storefront & website builder',
      description: 'A fully provisioned, brandable online store — themes, pages, and a checkout, out of the box.',
      accent: 'fuchsia',
    },
    {
      icon: 'package',
      title: 'Catalog & inventory',
      description: 'Products, variants, categories, and multi-warehouse stock, kept in sync everywhere you sell.',
      accent: 'sky',
    },
    {
      icon: 'gauge',
      title: 'Plans, billing & quotas',
      description: 'Usage-based limits and subscription billing for merchants — upgrade or downgrade without downtime.',
      accent: 'amber',
    },
    {
      icon: 'globe',
      title: 'Multi-channel selling',
      description: 'Connect marketplaces and social channels, manage every order from one inbox.',
      accent: 'indigo',
    },
    {
      icon: 'shield',
      title: 'Admin control plane',
      description: 'Platform health, tenant support, audited impersonation, and security policy in one console.',
      accent: 'emerald',
    },
    {
      icon: 'boxes',
      title: 'Supplier & reseller marketplace',
      description: 'An internal marketplace connecting suppliers and resellers directly into the merchant catalog.',
      accent: 'rose',
    },
  ],
};

const DEFAULT_CAREER: WebsiteCareerContent = {
  heading: 'Work on the platform merchants run their stores on',
  subheading: "We're a small team shipping fast — open roles are below.",
  openings: [],
};

const DEFAULT_CONTACT: WebsiteContactContent = {
  heading: "Let's talk",
  subheading: "Questions about a plan, a partnership, or anything else — we'd like to hear from you.",
  email: 'hello@ems.app',
  phone: '',
  address: '',
  ctaLabel: 'Email us',
  ctaHref: 'mailto:hello@ems.app',
};

const CACHE_TTL_SECONDS = 30;

@Injectable()
export class PlatformWebsiteService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  async getAll(): Promise<WebsiteContentResponse> {
    const [hero, features, header, footer, plansDisplay, about, products, career, contact] = await Promise.all([
      this.get('hero', DEFAULT_HERO),
      this.get('features', DEFAULT_FEATURES),
      this.get('header', DEFAULT_HEADER),
      this.get('footer', DEFAULT_FOOTER),
      this.get('plans_display', DEFAULT_PLANS_DISPLAY),
      this.get('about', DEFAULT_ABOUT),
      this.get('products', DEFAULT_PRODUCTS),
      this.get('career', DEFAULT_CAREER),
      this.get('contact', DEFAULT_CONTACT),
    ]);
    return { hero, features, header, footer, plansDisplay, about, products, career, contact };
  }

  async update(input: UpdateWebsiteContentRequest, actorId: string): Promise<WebsiteContentResponse> {
    const repo = this.dataSource.getRepository(WebsiteContentEntity);

    // One row per section that was actually sent — a partial `PUT` only touches the
    // sections present in the body, same as `PlatformSettingsService.update()`.
    const sections: [WebsiteContentKey, unknown][] = [
      ['hero', input.hero],
      ['features', input.features],
      ['header', input.header],
      ['footer', input.footer],
      ['plans_display', input.plansDisplay],
      ['about', input.about],
      ['products', input.products],
      ['career', input.career],
      ['contact', input.contact],
    ];

    for (const [key, value] of sections) {
      if (value === undefined) continue;
      await repo.save(repo.create({ key, value, updatedBy: actorId }));
      await this.cache.del(this.cacheKey(key));
    }

    return this.getAll();
  }

  /** Used by both the admin controller and the public one — content has no
   * per-viewer variation, so a single 30s-cached read serves everyone. */
  async get<T>(key: WebsiteContentKey, fallback: T): Promise<T> {
    const cached = await this.cache.get<T>(this.cacheKey(key));
    if (cached !== null) return cached;

    const row = await this.dataSource.getRepository(WebsiteContentEntity).findOne({ where: { key } });
    const value = (row?.value as T | undefined) ?? fallback;
    await this.cache.set(this.cacheKey(key), value, CACHE_TTL_SECONDS);
    return value;
  }

  private cacheKey(key: WebsiteContentKey): string {
    return `website-content:${key}`;
  }
}
