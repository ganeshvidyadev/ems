import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantEntity } from '../../database/entities';

export const STOREFRONT_THEMES = [
  {
    code: 'default',
    name: 'Default Modern',
    description: 'Clean, general-purpose storefront. Always available.',
  },
  {
    code: 'organic',
    name: 'Organic Botanicals',
    description: 'Green grocery & botanical design with photographic banners.',
  },
  {
    code: 'famms',
    name: 'Famms Luxury Fashion',
    description: 'High-fashion design with red accents and editorial banners.',
  },
  {
    code: 'circuit',
    name: 'Circuit Electronics',
    description: 'High-tech gadgets & electronics layout with dark accents and spec grids.',
  },
  {
    code: 'harvest',
    name: 'Harvest Supermarket',
    description: 'Fast-scan grocery tiles and delivery-window messaging for daily essentials.',
  },
] as const;

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
        .map((tenant) => ({
          id: tenant.publicId,
          name: tenant.businessName,
          slug: tenant.slug,
          ...this.assignment(tenant),
        })),
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
    return { selectedTheme: input.selectedTheme, allowedThemes: allowed };
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
