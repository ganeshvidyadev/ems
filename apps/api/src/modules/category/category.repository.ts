import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class CategoryRepository extends TenantScopedRepository<CategoryEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, CategoryEntity, context);
  }

  async slugExists(slug: string, storeId: string | null, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { slug, storeId: storeId ?? undefined } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  async findChildren(parentId: string | null): Promise<CategoryEntity[]> {
    return this.find({ where: { parentId: parentId ?? undefined }, order: { sortOrder: 'ASC' } });
  }

  /** Bulk `internal id → public_id` lookup — used to resolve `parentId` on response DTOs. */
  async publicIdsByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repository
      .createQueryBuilder('category')
      .select(['category.id AS id', 'category.publicId AS publicId'])
      .where('category.id IN (:...ids)', { ids })
      .andWhere('category.tenantId = :tenantId', { tenantId: this.tenantId })
      .getRawMany<{ id: string; publicId: string }>();
    return new Map(rows.map((row) => [row.id, row.publicId]));
  }

  /** Re-prefixes the moved node's own path plus every descendant's, in one statement. */
  async reprefixSubtree(oldPath: string, newPath: string, depthDelta: number): Promise<void> {
    await this.manager.query(
      `UPDATE categories
          SET path = CONCAT(?, SUBSTRING(path, ? + 1)),
              depth = depth + ?
        WHERE tenant_id = ?
          AND path LIKE CONCAT(?, '%')`,
      [newPath, oldPath.length, depthDelta, this.tenantId, oldPath],
    );
  }

  /** Resolves a store's internal id from its public id, scoped to the current tenant. */
  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [storePublicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }
}
