import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ProductEntity } from '../../database/entities';
import { OutboxService, type EmitEventInput } from '../../common/services/outbox.service';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

export interface ProductListFilter {
  storeId?: string;
  status?: string;
  visibility?: string;
  type?: string;
  brandId?: string;
  categoryId?: string;
  isFeatured?: boolean;
}

export interface ProductListSort {
  field: string;
  direction: 'ASC' | 'DESC';
}

/** Maps a wire-safe sort field to its actual listing-index column. */
const SORT_COLUMN: Record<string, string> = {
  publishedAt: 'p.published_at',
  name: 'p.name',
  priceMinor: 'p.price_minor',
  createdAt: 'p.created_at',
  totalSold: 'p.total_sold',
};

@Injectable()
export class ProductRepository extends TenantScopedRepository<ProductEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
    private readonly outbox: OutboxService,
  ) {
    super(manager, ProductEntity, context);
  }

  /**
   * Emits a domain event using THIS repository's manager — inside a transaction this is
   * the transactional manager (see `transaction()` in the base class), which is what
   * keeps the event and the write atomic. `OutboxService` needs a manager and `manager`
   * is protected on the base class, so this is the accessor the service layer uses
   * instead of reaching into the protected member directly.
   */
  async emitEvent(input: EmitEventInput): Promise<string> {
    return this.outbox.emit(this.manager, input);
  }

  async slugExists(slug: string, storeId: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { slug, storeId } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  async skuExists(sku: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { sku } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  /**
   * The listing query. Filters and the default sort deliberately follow
   * `idx_products_listing (tenant_id, store_id, status, visibility, is_live, published_at)`
   * column order — reordering these predicates does not change correctness but does
   * change whether MySQL can use the index as a pure range scan; see docs/02 §7.
   */
  async listing(
    filter: ProductListFilter,
    sort: ProductListSort[],
    skip: number,
    take: number,
  ): Promise<{ items: ProductEntity[]; total: number }> {
    const qb = this.scopedQueryBuilder('p').andWhere('p.deletedAt IS NULL');

    if (filter.storeId) qb.andWhere('p.storeId = :storeId', { storeId: filter.storeId });
    if (filter.status) qb.andWhere('p.status = :status', { status: filter.status });
    if (filter.visibility) qb.andWhere('p.visibility = :visibility', { visibility: filter.visibility });
    if (filter.type) qb.andWhere('p.type = :type', { type: filter.type });
    if (filter.brandId) qb.andWhere('p.brandId = :brandId', { brandId: filter.brandId });
    if (filter.isFeatured !== undefined) {
      qb.andWhere('p.isFeatured = :isFeatured', { isFeatured: filter.isFeatured });
    }
    if (filter.categoryId) {
      qb.innerJoin('product_categories', 'pc', 'pc.product_id = p.id AND pc.category_id = :categoryId', {
        categoryId: filter.categoryId,
      });
    }

    for (const clause of sort) {
      const column = SORT_COLUMN[clause.field] ?? SORT_COLUMN.publishedAt;
      qb.addOrderBy(column, clause.direction);
    }

    qb.skip(skip).take(take);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /** Fetches rows by internal id, preserving the given order — for search-ranked results. */
  async findByIdsOrdered(ids: string[]): Promise<ProductEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.scopedQueryBuilder('p').andWhere('p.id IN (:...ids)', { ids }).getMany();
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter((row): row is ProductEntity => Boolean(row));
  }

  // ---------------------------------------------------------------------------
  // Category links (`product_categories`)
  // ---------------------------------------------------------------------------

  async setCategoryLinks(
    productId: string,
    categoryIds: string[],
    primaryCategoryId: string | null,
  ): Promise<void> {
    await this.manager.query(`DELETE FROM product_categories WHERE tenant_id = ? AND product_id = ?`, [
      this.tenantId,
      productId,
    ]);

    for (const categoryId of categoryIds) {
      await this.manager.query(
        `INSERT INTO product_categories (tenant_id, product_id, category_id, is_primary)
         VALUES (?, ?, ?, ?)`,
        [this.tenantId, productId, categoryId, categoryId === primaryCategoryId ? 1 : 0],
      );
    }

    await this.recountCategoryProducts(categoryIds);
  }

  async categoryIdsFor(productId: string): Promise<{ categoryId: string; isPrimary: boolean }[]> {
    const rows = await this.manager.query(
      `SELECT category_id AS categoryId, is_primary AS isPrimary
         FROM product_categories WHERE tenant_id = ? AND product_id = ?`,
      [this.tenantId, productId],
    );
    return (rows as { categoryId: string; isPrimary: number }[]).map((row) => ({
      categoryId: row.categoryId,
      isPrimary: Boolean(row.isPrimary),
    }));
  }

  // ---------------------------------------------------------------------------
  // Cross-table public-id → internal-id resolvers.
  //
  // Shallow, single-column lookups against another module's table rather than injecting
  // that module's repository — keeps `product` from depending on `brand`/`category`/`tax`
  // at the DI-graph level for what is otherwise a one-column read, mirroring the same
  // pattern already used in `CategoryRepository.resolveStoreId`.
  // ---------------------------------------------------------------------------

  async resolveId(table: 'stores' | 'brands' | 'tax_classes' | 'categories', publicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM \`${table}\` WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [publicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  /** Used by bulk import, which addresses brands/categories by slug rather than public id. */
  async resolveIdBySlug(table: 'brands' | 'categories', slug: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM \`${table}\` WHERE slug = ? AND tenant_id = ? LIMIT 1`,
      [slug, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async findBySku(sku: string): Promise<ProductEntity | null> {
    return this.findOne({ where: { sku } });
  }

  async resolveIds(table: 'categories', publicIds: string[]): Promise<Map<string, string>> {
    if (publicIds.length === 0) return new Map();
    const rows = await this.manager.query(
      `SELECT id, public_id AS publicId FROM \`${table}\`
        WHERE tenant_id = ? AND public_id IN (${publicIds.map(() => '?').join(',')})`,
      [this.tenantId, ...publicIds],
    );
    return new Map((rows as { id: string; publicId: string }[]).map((row) => [row.publicId, row.id]));
  }

  /** Internal category id → public id, for hydrating a product's `categoryIds` response field. */
  async publicIdsForCategories(internalIds: string[]): Promise<Map<string, string>> {
    if (internalIds.length === 0) return new Map();
    const rows = await this.manager.query(
      `SELECT id, public_id AS publicId FROM categories
        WHERE tenant_id = ? AND id IN (${internalIds.map(() => '?').join(',')})`,
      [this.tenantId, ...internalIds],
    );
    return new Map((rows as { id: string; publicId: string }[]).map((row) => [row.id, row.publicId]));
  }

  /** Recounts the denormalized `categories.product_count` for the given categories only. */
  async recountCategoryProducts(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) return;
    await this.manager.query(
      `UPDATE categories c
          SET product_count = (
            SELECT COUNT(*) FROM product_categories pc
              JOIN products p ON p.id = pc.product_id AND p.deleted_at IS NULL
             WHERE pc.category_id = c.id
          )
        WHERE c.tenant_id = ? AND c.id IN (${categoryIds.map(() => '?').join(',')})`,
      [this.tenantId, ...categoryIds],
    );
  }
}
