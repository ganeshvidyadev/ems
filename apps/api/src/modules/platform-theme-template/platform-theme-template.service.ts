import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessRuleError, ConflictError, NotFoundError } from '@ems/kernel';
import type {
  CreateThemeTemplateRequest,
  PlatformThemeTemplateResponse,
  UpdateThemeTemplateRequest,
} from '@ems/contracts';
import { PlanEntity, TenantThemeEntity, ThemeTemplateEntity } from '../../database/entities';

@Injectable()
export class PlatformThemeTemplateService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(): Promise<PlatformThemeTemplateResponse[]> {
    const templates = await this.dataSource
      .getRepository(ThemeTemplateEntity)
      .find({ order: { category: 'ASC', name: 'ASC' } });
    return Promise.all(templates.map((t) => this.toResponse(t)));
  }

  async get(code: string): Promise<PlatformThemeTemplateResponse> {
    return this.toResponse(await this.findOrFail(code));
  }

  async create(input: CreateThemeTemplateRequest): Promise<PlatformThemeTemplateResponse> {
    const existing = await this.dataSource.getRepository(ThemeTemplateEntity).findOne({ where: { code: input.code } });
    if (existing) throw new ConflictError(`A theme template with code '${input.code}' already exists`);

    const minPlanId = await this.resolvePlanId(input.minPlanCode);

    const template = await this.dataSource.getRepository(ThemeTemplateEntity).save(
      this.dataSource.getRepository(ThemeTemplateEntity).create({
        code: input.code,
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        previewUrl: input.previewUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        demoUrl: input.demoUrl ?? null,
        isPremium: input.isPremium,
        priceMinor: input.priceMinor,
        minPlanId,
        defaultConfig: input.defaultConfig,
        schemaVersion: 1,
        status: 'ACTIVE',
      }),
    );

    return this.toResponse(template);
  }

  async update(code: string, input: UpdateThemeTemplateRequest): Promise<PlatformThemeTemplateResponse> {
    const template = await this.findOrFail(code);

    if (input.name !== undefined) template.name = input.name;
    if (input.category !== undefined) template.category = input.category;
    if (input.description !== undefined) template.description = input.description;
    if (input.previewUrl !== undefined) template.previewUrl = input.previewUrl;
    if (input.thumbnailUrl !== undefined) template.thumbnailUrl = input.thumbnailUrl;
    if (input.demoUrl !== undefined) template.demoUrl = input.demoUrl;
    if (input.isPremium !== undefined) template.isPremium = input.isPremium;
    if (input.priceMinor !== undefined) template.priceMinor = input.priceMinor;
    if (input.minPlanCode !== undefined) template.minPlanId = await this.resolvePlanId(input.minPlanCode);
    if (input.defaultConfig !== undefined) {
      // A later edit here must never reach a store that already cloned this
      // template — see `ThemeTemplateEntity`'s own doc comment. This only
      // changes what *new* selections start from.
      template.defaultConfig = input.defaultConfig;
    }

    await this.dataSource.getRepository(ThemeTemplateEntity).save(template);
    return this.toResponse(template);
  }

  async archive(code: string): Promise<PlatformThemeTemplateResponse> {
    const template = await this.findOrFail(code);
    template.status = 'ARCHIVED';
    await this.dataSource.getRepository(ThemeTemplateEntity).save(template);
    return this.toResponse(template);
  }

  async remove(code: string): Promise<void> {
    const template = await this.findOrFail(code);

    const usageCount = await this.dataSource
      .getRepository(TenantThemeEntity)
      .count({ where: { templateId: template.id } });
    if (usageCount > 0) {
      throw new BusinessRuleError(
        `Cannot delete '${code}': ${usageCount} store${usageCount === 1 ? ' has' : 's have'} a theme cloned from it. Archive it instead.`,
      );
    }

    await this.dataSource.getRepository(ThemeTemplateEntity).delete({ id: template.id });
  }

  private async findOrFail(code: string): Promise<ThemeTemplateEntity> {
    const template = await this.dataSource.getRepository(ThemeTemplateEntity).findOne({ where: { code } });
    if (!template) throw new NotFoundError('Theme template', code);
    return template;
  }

  private async resolvePlanId(planCode: string | undefined): Promise<number | null> {
    if (!planCode) return null;
    const plan = await this.dataSource.getRepository(PlanEntity).findOne({ where: { code: planCode } });
    if (!plan) throw new NotFoundError('Plan', planCode);
    return plan.id;
  }

  private async toResponse(template: ThemeTemplateEntity): Promise<PlatformThemeTemplateResponse> {
    const [minPlan, usageCount] = await Promise.all([
      template.minPlanId
        ? this.dataSource.getRepository(PlanEntity).findOne({ where: { id: template.minPlanId } })
        : Promise.resolve(null),
      this.dataSource.getRepository(TenantThemeEntity).count({ where: { templateId: template.id } }),
    ]);

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
      minPlanCode: minPlan?.code ?? null,
      defaultConfig: template.defaultConfig as PlatformThemeTemplateResponse['defaultConfig'],
      status: template.status,
      usageCount,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
