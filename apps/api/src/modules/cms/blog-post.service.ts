import { Injectable } from '@nestjs/common';
import type { BlogPostResponse, CreateBlogPostRequest, UpdateBlogPostRequest } from '@ems/contracts';
import { ConflictError, uniqueSlug } from '@ems/kernel';
import { HtmlSanitizerService } from '../../common/services/html-sanitizer.service';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import type { BlogPostEntity } from '../../database/entities';
import { CmsPageRepository } from './cms-page.repository';
import { BlogPostRepository } from './blog-post.repository';

@Injectable()
export class BlogPostService {
  constructor(
    private readonly posts: BlogPostRepository,
    // Reused purely for its store resolve/default helpers — identical logic
    // to `CmsPageRepository`'s, not worth a third copy of the same two queries.
    private readonly stores: CmsPageRepository,
    private readonly sanitizer: HtmlSanitizerService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    storeId?: string;
    status?: BlogPostEntity['status'];
    category?: string;
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<BlogPostEntity>> {
    let storeId: string | undefined;
    if (query.storeId) storeId = (await this.stores.resolveStoreId(query.storeId)) ?? undefined;

    return this.posts.findAndCount({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
      },
      order: Object.fromEntries(query.sort.map((s) => [s.field, s.direction])),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async getByPublicId(publicId: string): Promise<BlogPostEntity> {
    return this.posts.findByPublicIdOrFail(publicId);
  }

  async getBySlug(storePublicId: string, slug: string, countView = false): Promise<BlogPostEntity | null> {
    const storeId = await this.stores.resolveStoreId(storePublicId);
    if (!storeId) return null;
    const post = await this.posts.findBySlug(storeId, slug);
    if (post && countView) await this.posts.incrementViewCount(post.id);
    return post;
  }

  async create(input: CreateBlogPostRequest): Promise<BlogPostEntity> {
    const storeId = input.storeId
      ? await this.mustResolveStore(input.storeId)
      : await this.mustDefaultStore();

    const slug = await uniqueSlug(input.slug, (candidate) => this.posts.slugExists(storeId, candidate));

    return this.posts.insert({
      storeId,
      slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      contentHtml: input.contentHtml ? this.sanitizer.sanitizeContentHtml(input.contentHtml) : null,
      coverImageUrl: input.coverImageUrl ?? null,
      authorName: input.authorName ?? null,
      category: input.category ?? null,
      tags: input.tags ?? null,
      status: 'DRAFT',
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
    });
  }

  async update(publicId: string, input: UpdateBlogPostRequest): Promise<BlogPostEntity> {
    const post = await this.posts.findByPublicIdOrFail(publicId);

    const slug =
      input.slug && input.slug !== post.slug
        ? await uniqueSlug(input.slug, (candidate) => this.posts.slugExists(post.storeId, candidate, publicId))
        : post.slug;

    const wasPublished = post.status === 'PUBLISHED';
    const nowPublished = input.status === 'PUBLISHED';

    Object.assign(post, {
      slug,
      title: input.title ?? post.title,
      excerpt: input.excerpt ?? post.excerpt,
      contentHtml:
        input.contentHtml !== undefined ? this.sanitizer.sanitizeContentHtml(input.contentHtml) : post.contentHtml,
      coverImageUrl: input.coverImageUrl ?? post.coverImageUrl,
      authorName: input.authorName ?? post.authorName,
      category: input.category ?? post.category,
      tags: input.tags ?? post.tags,
      metaTitle: input.metaTitle ?? post.metaTitle,
      metaDescription: input.metaDescription ?? post.metaDescription,
      status: input.status ?? post.status,
      publishedAt: !wasPublished && nowPublished ? new Date() : post.publishedAt,
    });

    await this.posts.save(post);
    return post;
  }

  async remove(publicId: string): Promise<void> {
    await this.posts.softDeleteByPublicId(publicId);
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    const storeId = await this.stores.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }

  private async mustDefaultStore(): Promise<string> {
    const storeId = await this.stores.defaultStoreId();
    if (!storeId) throw new ConflictError('This tenant has no store to attach the post to');
    return storeId;
  }

  async toResponse(post: BlogPostEntity): Promise<BlogPostResponse> {
    const storeId = await this.stores.storePublicId(post.storeId);
    return {
      id: post.publicId,
      storeId: storeId ?? post.storeId,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      contentHtml: post.contentHtml,
      coverImageUrl: post.coverImageUrl,
      authorName: post.authorName,
      category: post.category,
      tags: post.tags,
      status: post.status,
      viewCount: post.viewCount,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}
