import { Injectable } from '@nestjs/common';
import type {
  CategoryResponse,
  CategoryTreeNode,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@ems/contracts';
import { ConflictError, newPublicId, uniqueSlug } from '@ems/kernel';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import { CacheService } from '../../common/services/cache.service';
import type { CategoryEntity } from '../../database/entities';
import { CategoryRepository } from './category.repository';

@Injectable()
export class CategoryService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly cache: CacheService,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    parentPublicId?: string;
    isActive?: boolean;
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<CategoryEntity>> {
    let parentId: string | undefined;
    if (query.parentPublicId) {
      parentId = (await this.categories.findByPublicIdOrFail(query.parentPublicId)).id;
    }

    return this.categories.findAndCount({
      where: {
        ...(parentId !== undefined ? { parentId } : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      order: Object.fromEntries(query.sort.map((s) => [s.field, s.direction])),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  /** Batch-resolves `parentId` (internal) → public ids for a page of results. */
  async toResponseList(items: CategoryEntity[]): Promise<CategoryResponse[]> {
    const parentIds = [...new Set(items.map((c) => c.parentId).filter((id): id is string => id !== null))];
    const parentPublicIds = await this.categories.publicIdsByIds(parentIds);
    return items.map((c) => this.toResponse(c, c.parentId ? (parentPublicIds.get(c.parentId) ?? null) : null));
  }

  /** The full tenant tree (optionally scoped to one store) as a nested structure, one query. */
  async tree(storeId?: string): Promise<CategoryTreeNode[]> {
    const all = await this.categories.find({
      where: storeId === undefined ? {} : { storeId },
      order: { depth: 'ASC', sortOrder: 'ASC' },
    });

    const byParent = new Map<string | null, CategoryEntity[]>();
    for (const category of all) {
      const key = category.parentId;
      const bucket = byParent.get(key) ?? [];
      bucket.push(category);
      byParent.set(key, bucket);
    }

    const build = (parentId: string | null, parentPublicId: string | null): CategoryTreeNode[] =>
      (byParent.get(parentId) ?? []).map((category) => ({
        ...this.toResponse(category, parentPublicId),
        children: build(category.id, category.publicId),
      }));

    return build(null, null);
  }

  async getByPublicId(publicId: string): Promise<CategoryEntity> {
    return this.categories.findByPublicIdOrFail(publicId);
  }

  async resolveParentPublicId(category: CategoryEntity): Promise<string | null> {
    if (!category.parentId) return null;
    return (await this.categories.publicIdsByIds([category.parentId])).get(category.parentId) ?? null;
  }

  async create(input: CreateCategoryRequest): Promise<CategoryEntity> {
    return this.categories.transaction(async (repo) => {
      const parent = input.parentId
        ? await repo.findByPublicIdOrFail(input.parentId)
        : null;

      const slug = await uniqueSlug(input.slug ?? input.name, (candidate) =>
        repo.slugExists(candidate, null),
      );

      let storeId: string | null = null;
      if (input.storeId) {
        storeId = await repo.resolveStoreId(input.storeId);
        if (!storeId) throw new ConflictError(`Store '${input.storeId}' not found`);
      }

      // path/depth need the auto-increment id, so insert with a placeholder and correct it
      // in the same transaction once the id is known.
      const category = await repo.insert({
        publicId: newPublicId(),
        parentId: parent?.id ?? null,
        storeId,
        name: input.name,
        slug,
        path: '/pending/',
        depth: parent ? parent.depth + 1 : 0,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        sortOrder: input.sortOrder,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        isActive: input.isActive,
        showInMenu: input.showInMenu,
      });

      category.path = `${parent?.path ?? '/'}${category.id}/`;
      await repo.save(category);

      return category;
    }).finally(() => this.invalidate());
  }

  async update(publicId: string, input: UpdateCategoryRequest): Promise<CategoryEntity> {
    const category = await this.categories.findByPublicIdOrFail(publicId);

    const slug =
      input.slug && input.slug !== category.slug
        ? await uniqueSlug(input.slug, (candidate) =>
            this.categories.slugExists(candidate, category.storeId, publicId),
          )
        : category.slug;

    Object.assign(category, {
      name: input.name ?? category.name,
      slug,
      description: input.description ?? category.description,
      imageUrl: input.imageUrl ?? category.imageUrl,
      bannerUrl: input.bannerUrl ?? category.bannerUrl,
      sortOrder: input.sortOrder ?? category.sortOrder,
      metaTitle: input.metaTitle ?? category.metaTitle,
      metaDescription: input.metaDescription ?? category.metaDescription,
      isActive: input.isActive ?? category.isActive,
      showInMenu: input.showInMenu ?? category.showInMenu,
    });

    await this.categories.save(category);
    await this.invalidate();
    return category;
  }

  /**
   * Re-parents a category and every descendant in one statement.
   *
   * Cycle guard: a category cannot move under its own descendant — that would
   * disconnect it from the tree the moment the prefix rewrite ran.
   */
  async move(publicId: string, newParentPublicId: string | null): Promise<CategoryEntity> {
    return this.categories
      .transaction(async (repo) => {
        const category = await repo.findByPublicIdOrFail(publicId);
        const newParent = newParentPublicId ? await repo.findByPublicIdOrFail(newParentPublicId) : null;

        if (newParent && newParent.path.startsWith(category.path)) {
          throw new ConflictError('A category cannot move under its own descendant');
        }

        const newDepth = newParent ? newParent.depth + 1 : 0;
        const newPath = `${newParent?.path ?? '/'}${category.id}/`;
        const depthDelta = newDepth - category.depth;

        await repo.reprefixSubtree(category.path, newPath, depthDelta);

        category.parentId = newParent?.id ?? null;
        category.path = newPath;
        category.depth = newDepth;
        await repo.save(category);

        return category;
      })
      .finally(() => this.invalidate());
  }

  async reorder(parentPublicId: string | null, orderedPublicIds: string[]): Promise<void> {
    await this.categories.transaction(async (repo) => {
      for (const [index, publicId] of orderedPublicIds.entries()) {
        const category = await repo.findByPublicIdOrFail(publicId);
        category.sortOrder = index;
        await repo.save(category);
      }
    });
    await this.invalidate();
  }

  async remove(publicId: string): Promise<void> {
    const category = await this.categories.findByPublicIdOrFail(publicId);
    const children = await this.categories.findChildren(category.id);
    if (children.length > 0) {
      throw new ConflictError('Move or delete child categories first');
    }

    await this.categories.softDeleteByPublicId(publicId);
    await this.invalidate();
  }

  private async invalidate(): Promise<void> {
    await this.cache.invalidateMany(['categories', 'products']);
  }

  toResponse(category: CategoryEntity, parentPublicId: string | null = null): CategoryResponse {
    return {
      id: category.publicId,
      parentId: parentPublicId,
      name: category.name,
      slug: category.slug,
      path: category.path,
      depth: category.depth,
      description: category.description,
      imageUrl: category.imageUrl,
      bannerUrl: category.bannerUrl,
      sortOrder: category.sortOrder,
      productCount: category.productCount,
      metaTitle: category.metaTitle,
      metaDescription: category.metaDescription,
      isActive: category.isActive,
      showInMenu: category.showInMenu,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}
