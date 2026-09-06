import { Injectable } from '@nestjs/common';
import type { CmsPageResponse, CreateCmsPageRequest, UpdateCmsPageRequest } from '@ems/contracts';
import { ConflictError, uniqueSlug } from '@ems/kernel';
import { HtmlSanitizerService } from '../../common/services/html-sanitizer.service';
import { CacheService } from '../../common/services/cache.service';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import type { CmsPageEntity } from '../../database/entities';
import { CmsPageRepository } from './cms-page.repository';

@Injectable()
export class CmsPageService {
  constructor(
    private readonly pages: CmsPageRepository,
    private readonly sanitizer: HtmlSanitizerService,
    private readonly cache: CacheService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    storeId?: string;
    status?: CmsPageEntity['status'];
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<CmsPageEntity>> {
    let storeId: string | undefined;
    if (query.storeId) storeId = (await this.pages.resolveStoreId(query.storeId)) ?? undefined;

    return this.pages.findAndCount({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: Object.fromEntries(query.sort.map((s) => [s.field, s.direction])),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async getByPublicId(publicId: string): Promise<CmsPageEntity> {
    return this.pages.findByPublicIdOrFail(publicId);
  }

  async getBySlug(storePublicId: string, slug: string): Promise<CmsPageEntity | null> {
    const storeId = await this.pages.resolveStoreId(storePublicId);
    if (!storeId) return null;
    return this.pages.findBySlug(storeId, slug);
  }

  async create(input: CreateCmsPageRequest): Promise<CmsPageEntity> {
    const storeId = input.storeId
      ? await this.mustResolveStore(input.storeId)
      : await this.mustDefaultStore();

    const slug = await uniqueSlug(input.slug, (candidate) => this.pages.slugExists(storeId, candidate));

    const page = await this.pages.insert({
      storeId,
      slug,
      title: input.title,
      contentHtml: input.contentHtml ? this.sanitizer.sanitizeContentHtml(input.contentHtml) : null,
      contentBlocks: input.contentBlocks ?? null,
      template: input.template ?? null,
      status: 'DRAFT',
      isSystem: false,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      noIndex: input.noIndex,
    });

    await this.invalidate();
    return page;
  }

  async update(publicId: string, input: UpdateCmsPageRequest): Promise<CmsPageEntity> {
    const page = await this.pages.findByPublicIdOrFail(publicId);

    const slug =
      input.slug && input.slug !== page.slug
        ? await uniqueSlug(input.slug, (candidate) => this.pages.slugExists(page.storeId, candidate, publicId))
        : page.slug;

    const wasPublished = page.status === 'PUBLISHED';
    const nowPublished = input.status === 'PUBLISHED';

    Object.assign(page, {
      slug,
      title: input.title ?? page.title,
      contentHtml:
        input.contentHtml !== undefined ? this.sanitizer.sanitizeContentHtml(input.contentHtml) : page.contentHtml,
      contentBlocks: input.contentBlocks ?? page.contentBlocks,
      template: input.template ?? page.template,
      metaTitle: input.metaTitle ?? page.metaTitle,
      metaDescription: input.metaDescription ?? page.metaDescription,
      canonicalUrl: input.canonicalUrl ?? page.canonicalUrl,
      noIndex: input.noIndex ?? page.noIndex,
      status: input.status ?? page.status,
      publishedAt: !wasPublished && nowPublished ? new Date() : page.publishedAt,
    });

    await this.pages.save(page);
    await this.invalidate();
    return page;
  }

  async remove(publicId: string): Promise<void> {
    const page = await this.pages.findByPublicIdOrFail(publicId);
    if (page.isSystem) {
      throw new ConflictError('System pages (privacy policy, terms of service) cannot be deleted');
    }
    await this.pages.softDeleteByPublicId(publicId);
    await this.invalidate();
  }

  private async invalidate(): Promise<void> {
    await this.cache.invalidate('home');
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    const storeId = await this.pages.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }

  private async mustDefaultStore(): Promise<string> {
    const storeId = await this.pages.defaultStoreId();
    if (!storeId) throw new ConflictError('This tenant has no store to attach the page to');
    return storeId;
  }

  async toResponse(page: CmsPageEntity): Promise<CmsPageResponse> {
    const storeId = await this.pages.storePublicId(page.storeId);
    return {
      id: page.publicId,
      storeId: storeId ?? page.storeId,
      slug: page.slug,
      title: page.title,
      contentHtml: page.contentHtml,
      contentBlocks: page.contentBlocks,
      template: page.template,
      status: page.status,
      isSystem: page.isSystem,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      canonicalUrl: page.canonicalUrl,
      noIndex: page.noIndex,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
    };
  }
}
