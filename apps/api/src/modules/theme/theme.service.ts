import { Injectable } from '@nestjs/common';
import type {
  LiveThemeResponse,
  TenantThemeResponse,
  ThemeSection,
  ThemeTemplateResponse,
  UpdateThemeConfigRequest,
  UpdateThemeCustomCodeRequest,
} from '@ems/contracts';
import { ConflictError, NotFoundError } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CacheService } from '../../common/services/cache.service';
import { HtmlSanitizerService } from '../../common/services/html-sanitizer.service';
import { PlanFeatureUnavailableError } from '../../common/errors/api.errors';
import { RequestContextService } from '../../common/services/request-context.service';
import type { TenantThemeEntity, ThemeTemplateEntity } from '../../database/entities';
import { ThemeTemplateRepository } from './theme-template.repository';
import { TenantThemeRepository } from './tenant-theme.repository';

@Injectable()
export class ThemeService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly templates: ThemeTemplateRepository,
    private readonly tenantThemes: TenantThemeRepository,
    private readonly cache: CacheService,
    private readonly sanitizer: HtmlSanitizerService,
    private readonly context: RequestContextService,
  ) {}

  // =========================================================================
  // Template gallery
  // =========================================================================

  async listGallery(): Promise<ThemeTemplateResponse[]> {
    const templates = await this.templates.findActive();
    const currentPlanSortOrder = await this.currentPlanSortOrder();

    const responses = await Promise.all(
      templates.map(async (template) => {
        const locked = template.minPlanId
          ? (await this.planSortOrder(template.minPlanId)) > currentPlanSortOrder
          : false;
        return this.templateToResponse(template, locked);
      }),
    );
    return responses;
  }

  private async currentPlanSortOrder(): Promise<number> {
    const tenantId = this.context.requireTenantId('theme gallery');
    const rows = (await this.manager.query(
      `SELECT p.sort_order AS sortOrder
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.tenant_id = ? AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
        LIMIT 1`,
      [tenantId],
    )) as { sortOrder: number }[];
    return rows[0]?.sortOrder ?? 0;
  }

  private async planSortOrder(planId: number): Promise<number> {
    const rows = (await this.manager.query(`SELECT sort_order AS sortOrder FROM plans WHERE id = ?`, [
      planId,
    ])) as { sortOrder: number }[];
    return rows[0]?.sortOrder ?? 0;
  }

  // =========================================================================
  // Clone-on-select
  // =========================================================================

  /**
   * Clones a template into a new draft theme for one store.
   *
   * The clone happens once, at selection time — a later edit to the
   * template's `defaultConfig` never reaches a store that already picked it,
   * which is the entire reason `tenant_themes` exists as its own copy rather
   * than a reference back to `theme_templates`.
   */
  async clone(storePublicId: string, templateCode: string, name?: string): Promise<TenantThemeEntity> {
    const template = await this.templates.findByCode(templateCode);
    if (!template) throw new NotFoundError('Theme template', templateCode);

    if (template.isPremium && template.minPlanId) {
      const [current, required] = await Promise.all([
        this.currentPlanSortOrder(),
        this.planSortOrder(template.minPlanId),
      ]);
      if (current < required) {
        throw new PlanFeatureUnavailableError(`theme:${template.code}`);
      }
    }

    const storeId = await this.tenantThemes.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);

    return this.tenantThemes.insert({
      storeId,
      templateId: template.id,
      name: name ?? template.name,
      config: structuredCloneJson(template.defaultConfig),
      customCss: null,
      customHeadHtml: null,
      status: 'DRAFT',
      publishedConfig: null,
    });
  }

  // =========================================================================
  // Draft editing
  // =========================================================================

  async listForStore(storePublicId: string): Promise<TenantThemeEntity[]> {
    const storeId = await this.tenantThemes.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return this.tenantThemes.findByStore(storeId);
  }

  async getByPublicId(publicId: string): Promise<TenantThemeEntity> {
    return this.tenantThemes.findByPublicIdOrFail(publicId);
  }

  async updateConfig(publicId: string, input: UpdateThemeConfigRequest): Promise<TenantThemeEntity> {
    const theme = await this.tenantThemes.findByPublicIdOrFail(publicId);
    if (theme.status === 'ARCHIVED') throw new ConflictError('An archived theme cannot be edited');

    const config = theme.config as {
      colors?: Record<string, string>;
      typography?: Record<string, unknown>;
      sections?: ThemeSection[];
    };

    theme.config = {
      ...config,
      colors: input.colors ?? config.colors,
      typography: input.typography ?? config.typography,
      sections: input.sections ?? config.sections,
    };
    if (input.name) theme.name = input.name;

    await this.tenantThemes.save(theme);
    return theme;
  }

  async updateCustomCode(publicId: string, input: UpdateThemeCustomCodeRequest): Promise<TenantThemeEntity> {
    const theme = await this.tenantThemes.findByPublicIdOrFail(publicId);
    if (theme.status === 'ARCHIVED') throw new ConflictError('An archived theme cannot be edited');

    if (input.customCss !== undefined) {
      theme.customCss = input.customCss === null ? null : this.sanitizer.sanitizeCss(input.customCss);
    }
    if (input.customHeadHtml !== undefined) {
      theme.customHeadHtml =
        input.customHeadHtml === null ? null : this.sanitizer.sanitizeHeadHtml(input.customHeadHtml);
    }

    await this.tenantThemes.save(theme);
    return theme;
  }

  // =========================================================================
  // Publish
  // =========================================================================

  /**
   * Publishes the current draft. `publishedConfig`/`publishedAt` are what
   * `getLive()` reads — the draft `config` keeps changing underneath without
   * ever touching what a shopper sees until this runs again.
   *
   * Cache invalidation here is this codebase's stand-in for Next.js's
   * `revalidateTag`: the storefront isn't built in this pass, so "live in
   * under 10s without a deploy" is proven only as far as this API's own
   * cached read goes, not through an actual page re-render.
   */
  async publish(publicId: string): Promise<TenantThemeEntity> {
    const theme = await this.tenantThemes.findByPublicIdOrFail(publicId);

    // Publishing this theme is exclusive: only one PUBLISHED theme per store.
    const previouslyLive = await this.tenantThemes.findPublished(theme.storeId);
    if (previouslyLive && previouslyLive.id !== theme.id) {
      previouslyLive.status = 'ARCHIVED';
      await this.tenantThemes.save(previouslyLive);
    }

    theme.status = 'PUBLISHED';
    theme.publishedAt = new Date();
    theme.publishedConfig = structuredCloneJson(theme.config);
    await this.tenantThemes.save(theme);

    await this.cache.invalidate('theme');
    return theme;
  }

  /** What the storefront actually renders — always the published snapshot. */
  async getLive(storePublicId: string): Promise<LiveThemeResponse | null> {
    return this.cache.wrap('theme', `live:${storePublicId}`, async () => {
      const storeId = await this.tenantThemes.resolveStoreId(storePublicId);
      if (!storeId) return null;

      const theme = await this.tenantThemes.findPublished(storeId);
      if (!theme?.publishedConfig) return null;

      const template = await this.templates.findById(theme.templateId);

      return {
        templateCode: template?.code ?? '',
        name: theme.name,
        config: theme.publishedConfig,
        customCss: theme.customCss,
        customHeadHtml: theme.customHeadHtml,
        publishedAt: theme.publishedAt?.toISOString() ?? null,
      };
    });
  }

  // =========================================================================
  // Mapping
  // =========================================================================

  private templateToResponse(template: ThemeTemplateEntity, locked: boolean): ThemeTemplateResponse {
    return {
      id: String(template.id),
      code: template.code,
      name: template.name,
      category: template.category,
      description: template.description,
      previewUrl: template.previewUrl,
      thumbnailUrl: template.thumbnailUrl,
      demoUrl: template.demoUrl,
      isPremium: template.isPremium,
      priceMinor: template.priceMinor,
      status: template.status,
      locked,
    };
  }

  async toResponse(theme: TenantThemeEntity): Promise<TenantThemeResponse> {
    const template = await this.templates.findById(theme.templateId);
    const storeId = await this.tenantThemes.storePublicId(theme.storeId);

    return {
      id: theme.publicId,
      storeId: storeId ?? theme.storeId,
      templateCode: template?.code ?? '',
      name: theme.name,
      config: theme.config,
      customCss: theme.customCss,
      customHeadHtml: theme.customHeadHtml,
      status: theme.status,
      publishedAt: theme.publishedAt?.toISOString() ?? null,
      createdAt: theme.createdAt.toISOString(),
      updatedAt: theme.updatedAt.toISOString(),
    };
  }
}

/** A cheap, dependency-free deep clone for plain JSON config — no functions/dates/etc. to worry about. */
function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
