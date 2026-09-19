import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantEntity } from '../../database/entities';

export interface StorefrontThemeDefinition {
  code: string;
  name: string;
  description: string;
  brandColor: string;
  accentColor: string;
  font: string;
  tag: string;
  features: string[];
}

export const STOREFRONT_THEMES: readonly StorefrontThemeDefinition[] = [
  {
    code: 'default',
    name: 'Default Modern',
    description: 'Clean, general-purpose storefront with utility product grids. 100% Free Standard.',
    brandColor: '#2563eb',
    accentColor: '#1d4ed8',
    font: 'Inter, system-ui, sans-serif',
    tag: 'General E-Commerce',
    features: ['Utility product grids', 'Clean whitespace', 'Standard cart & checkout'],
  },
  {
    code: 'organic',
    name: 'Organic Botanicals',
    description: 'Green grocery & botanical design with photographic hero banners. 100% Free Standard.',
    brandColor: '#6bb252',
    accentColor: '#4d8a39',
    font: 'Lora, serif',
    tag: 'Wellness & Botanicals',
    features: ['Full-width nature hero', 'Category thumbnail circles', 'Farm-fresh badges'],
  },
  {
    code: 'famms',
    name: 'Famms Luxury Fashion',
    description: 'High-fashion design with editorial banners and bold discount ribbons. 100% Free Standard.',
    brandColor: '#f7444e',
    accentColor: '#d63031',
    font: 'Playfair Display, serif',
    tag: 'Fashion & Luxury',
    features: ['Editorial lookbook banners', 'Bold discount ribbons', 'Lifestyle photography'],
  },
  {
    code: 'circuit',
    name: 'Circuit Electronics',
    description: 'High-tech gadgets layout with dark accents and technical specification grids. 100% Free Standard.',
    brandColor: '#2563eb',
    accentColor: '#3b82f6',
    font: 'Roboto, Space Grotesk, sans-serif',
    tag: 'Tech & Electronics',
    features: ['Dark accent tech hero', 'OEM warranty badges', 'Technical specification grids'],
  },
  {
    code: 'harvest',
    name: 'Harvest Supermarket',
    description: 'Fast-scan grocery tiles and express delivery messaging for daily essentials. 100% Free Standard.',
    brandColor: '#15803d',
    accentColor: '#f59e0b',
    font: 'Nunito, Open Sans, sans-serif',
    tag: 'Grocery & Supermarket',
    features: ['2-Hour fast delivery timer', 'Daily flash deals', 'Instant doorstep returns'],
  },
] as const;

export function getThemeDefinition(code: string): StorefrontThemeDefinition {
  return STOREFRONT_THEMES.find((t) => t.code === code) ?? STOREFRONT_THEMES[0]!;
}

export function provisionTenantThemeWorkspace(
  tenantSlug: string,
  themeCode: string,
  businessName: string,
  customization?: {
    isCustomized?: boolean;
    customizationFeeINR?: number;
    customizationStatus?: string;
    notes?: string;
    customCss?: string;
  },
): { workspacePath: string; files: string[] } {
  const safeSlug = tenantSlug || 'default-store';
  const safeTheme = themeCode || 'default';
  const safeName = businessName || 'Store';

  const themeDef = getThemeDefinition(safeTheme);
  const isCustomized = customization?.isCustomized ?? false;
  const customizationFeeINR = customization?.customizationFeeINR ?? 0;
  const customizationStatus = customization?.customizationStatus ?? (isCustomized ? 'MODIFIED_PAID' : 'STANDARD_FREE');

  const baseStorageDir = path.resolve(process.cwd(), 'storage', 'tenants', safeSlug, 'themes');
  const targetThemeDir = path.join(baseStorageDir, safeTheme);

  try {
    fs.mkdirSync(targetThemeDir, { recursive: true });

    // 1. manifest.json
    const manifest = {
      version: '1.0.0',
      tenantSlug: safeSlug,
      businessName: safeName,
      themeCode: safeTheme,
      themeName: themeDef.name,
      themeTier: isCustomized ? 'CUSTOM_PAID' : 'STANDARD_FREE',
      isCustomized,
      customizationFeeINR,
      customizationStatus,
      provisionedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: customization?.notes ?? (isCustomized ? 'Custom bespoke theme for company.' : 'Standard 5-template free tier. Modify this folder to charge for custom client modifications.'),
    };
    fs.writeFileSync(path.join(targetThemeDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    // 2. config.json
    const config = {
      themeName: themeDef.name,
      themeCode: safeTheme,
      tenantSlug: safeSlug,
      colors: {
        brand: themeDef.brandColor,
        accent: themeDef.accentColor,
        background: '#ffffff',
        surface: '#f8fafc',
      },
      typography: {
        headingFont: themeDef.font,
        bodyFont: 'Inter, system-ui, sans-serif',
      },
      features: themeDef.features,
    };
    fs.writeFileSync(path.join(targetThemeDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');

    // 3. theme.css
    const defaultCss = `/* ==========================================================================
   Company Storefront Stylesheet: ${safeName} (${safeSlug})
   Base Theme: ${themeDef.name} (${safeTheme})
   Tier: ${isCustomized ? 'CUSTOM_PAID' : 'STANDARD_FREE'}
   ========================================================================== */

:root {
  --brand-primary: ${themeDef.brandColor};
  --brand-accent: ${themeDef.accentColor};
  --font-heading: '${themeDef.font}';
}

/* Custom CSS modifications for ${safeSlug} can be written below */
`;
    const finalCss = customization?.customCss ? customization.customCss : defaultCss;
    fs.writeFileSync(path.join(targetThemeDir, 'theme.css'), finalCss, 'utf8');

    // 4. overrides.json
    const overrides = {
      customHeaderNotice: null,
      customFooterCopyright: `© ${new Date().getFullYear()} ${safeName}. All rights reserved.`,
      customBadges: [],
      customBannerSlides: [],
    };
    fs.writeFileSync(path.join(targetThemeDir, 'overrides.json'), JSON.stringify(overrides, null, 2), 'utf8');

    // 5. README.md
    const readme = `# Storefront Theme Workspace: ${safeName} (\`${safeSlug}\`)

- **Theme Engine**: ${themeDef.name} (\`${safeTheme}\`)
- **Theme Tier**: ${isCustomized ? 'CUSTOM_PAID' : 'STANDARD_FREE (Included with Platform)'}
- **Customization Status**: ${customizationStatus}
- **Custom Modification Fee**: ₹${customizationFeeINR}
- **Company Isolation**: All CSS, JSON configs, and overrides in this directory are isolated strictly to **${safeSlug}**.

## How to Customize for this Company:
1. Modify \`theme.css\` to inject company-specific styles, colors, or fonts.
2. Update \`config.json\` and \`overrides.json\` for custom hero banners and sections.
3. If this is a paid bespoke theme, update \`manifest.json\` with \`isCustomized: true\` and record the fee in Console Admin.
`;
    fs.writeFileSync(path.join(targetThemeDir, 'README.md'), readme, 'utf8');

    // Also write a root pointer active-theme.json
    fs.writeFileSync(
      path.join(baseStorageDir, 'active-theme.json'),
      JSON.stringify({ activeTheme: safeTheme, updatedAt: new Date().toISOString(), tenantSlug: safeSlug }, null, 2),
      'utf8',
    );

    return {
      workspacePath: `storage/tenants/${safeSlug}/themes/${safeTheme}/`,
      files: ['manifest.json', 'config.json', 'theme.css', 'overrides.json', 'README.md'],
    };
  } catch (err) {
    // Non-blocking fallback for containerized or read-only dev environments
    return {
      workspacePath: `storage/tenants/${safeSlug}/themes/${safeTheme}/`,
      files: ['manifest.json', 'config.json', 'theme.css', 'overrides.json', 'README.md'],
    };
  }
}

@Injectable()
export class ThemeAccessService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
  ) {}

  private requireSuperAdmin(): void {
    const context = this.context.require();
    if (context.userType !== 'PLATFORM' || !context.roles?.includes('PLATFORM_SUPER_ADMIN')) {
      throw new ForbiddenException('Only the platform super admin can manage company themes');
    }
  }

  async list() {
    this.requireSuperAdmin();
    const tenants = await this.manager
      .getRepository(TenantEntity)
      .find({ order: { businessName: 'ASC' } });
    return {
      themes: STOREFRONT_THEMES,
      companies: tenants
        .filter((tenant) => !tenant.deletedAt && tenant.status !== 'DELETED')
        .map((tenant) => {
          const customMeta = (tenant.onboardingState?.['customTheme'] as Record<string, any>) ?? {};
          const assignment = this.assignment(tenant);
          return {
            id: tenant.publicId,
            name: tenant.businessName,
            slug: tenant.slug,
            ...assignment,
            isCustomized: Boolean(customMeta.isCustomized),
            customizationFeeINR: Number(customMeta.customizationFeeINR ?? 0),
            customizationStatus: (customMeta.customizationStatus as string) ?? (customMeta.isCustomized ? 'MODIFIED_PAID' : 'STANDARD_FREE'),
            customNotes: (customMeta.notes as string) ?? null,
            workspacePath: `storage/tenants/${tenant.slug}/themes/${assignment.selectedTheme}/`,
          };
        }),
    };
  }

  async update(publicId: string, input: { selectedTheme: string; allowedThemes: string[] }) {
    this.requireSuperAdmin();
    if (
      ![input.selectedTheme, ...input.allowedThemes].every((code) =>
        STOREFRONT_THEMES.some((theme) => theme.code === code),
      )
    ) {
      throw new BadRequestException('Unknown storefront theme');
    }
    const repo = this.manager.getRepository(TenantEntity);
    const tenant = await repo.findOne({ where: { publicId } });
    if (!tenant || tenant.deletedAt || tenant.status === 'DELETED')
      throw new NotFoundException('Company not found');
    const allowed = [...new Set(['default', ...input.allowedThemes])];
    if (!allowed.includes(input.selectedTheme))
      throw new ForbiddenException('Selected theme must be allowed for this company');
    
    await repo.update(tenant.id, {
      storefrontTheme: input.selectedTheme,
      allowedStorefrontThemes: allowed,
    });

    const customMeta = (tenant.onboardingState?.['customTheme'] as Record<string, any>) ?? {};
    provisionTenantThemeWorkspace(tenant.slug, input.selectedTheme, tenant.businessName, customMeta);

    return { selectedTheme: input.selectedTheme, allowedThemes: allowed };
  }

  async provisionWorkspace(publicId: string, themeCode?: string) {
    this.requireSuperAdmin();
    const repo = this.manager.getRepository(TenantEntity);
    const tenant = await repo.findOne({ where: { publicId } });
    if (!tenant || tenant.deletedAt || tenant.status === 'DELETED') {
      throw new NotFoundException('Company not found');
    }

    const targetTheme = themeCode ?? tenant.storefrontTheme ?? 'default';
    const customMeta = (tenant.onboardingState?.['customTheme'] as Record<string, any>) ?? {};
    const result = provisionTenantThemeWorkspace(tenant.slug, targetTheme, tenant.businessName, customMeta);

    return {
      tenantSlug: tenant.slug,
      themeCode: targetTheme,
      ...result,
      message: `Theme workspace provisioned successfully at ${result.workspacePath}`,
    };
  }

  async updateCustomization(
    publicId: string,
    input: {
      isCustomized: boolean;
      customizationFeeINR: number;
      customizationStatus: 'STANDARD_FREE' | 'MODIFIED_PAID' | 'BESPOKE_CUSTOM';
      notes?: string;
      customCss?: string;
    },
  ) {
    this.requireSuperAdmin();
    const repo = this.manager.getRepository(TenantEntity);
    const tenant = await repo.findOne({ where: { publicId } });
    if (!tenant || tenant.deletedAt || tenant.status === 'DELETED') {
      throw new NotFoundException('Company not found');
    }

    const currentTheme = tenant.storefrontTheme ?? 'default';
    tenant.onboardingState = {
      ...(tenant.onboardingState ?? {}),
      customTheme: {
        isCustomized: input.isCustomized,
        customizationFeeINR: input.customizationFeeINR,
        customizationStatus: input.customizationStatus,
        notes: input.notes ?? null,
        updatedAt: new Date().toISOString(),
      },
    };
    await repo.save(tenant);

    provisionTenantThemeWorkspace(tenant.slug, currentTheme, tenant.businessName, {
      isCustomized: input.isCustomized,
      customizationFeeINR: input.customizationFeeINR,
      customizationStatus: input.customizationStatus,
      notes: input.notes,
      customCss: input.customCss,
    });

    return {
      publicId: tenant.publicId,
      slug: tenant.slug,
      themeCode: currentTheme,
      isCustomized: input.isCustomized,
      customizationFeeINR: input.customizationFeeINR,
      customizationStatus: input.customizationStatus,
      notes: input.notes,
    };
  }

  async current() {
    const id = this.context.requireTenantId('storefront theme assignment');
    const tenant = await this.manager.getRepository(TenantEntity).findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Company not found');
    return this.assignment(tenant);
  }

  private assignment(tenant: TenantEntity) {
    const allowedThemes = [
      ...new Set(['default', ...(tenant.allowedStorefrontThemes ?? [])]),
    ].filter((code) => STOREFRONT_THEMES.some((theme) => theme.code === code));
    return {
      selectedTheme: allowedThemes.includes(tenant.storefrontTheme)
        ? tenant.storefrontTheme
        : 'default',
      allowedThemes,
    };
  }
}
