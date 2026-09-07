import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ReviewEntity, type ReviewStatus } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository, type PaginatedResult } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class ReviewRepository extends TenantScopedRepository<ReviewEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ReviewEntity, context);
  }

  /** Console moderation queue — every status, optionally scoped to one product. */
  async listForModeration(filter: {
    productId?: string;
    status?: ReviewStatus;
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
    page: number;
    limit: number;
  }): Promise<PaginatedResult<ReviewEntity>> {
    return this.findAndCount({
      where: {
        ...(filter.productId ? { productId: filter.productId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      order: Object.fromEntries(filter.sort.map((s) => [s.field, s.direction])) as never,
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    });
  }

  /** Storefront — approved reviews for one product, newest first. */
  async listApprovedForProduct(productId: string, page: number, limit: number): Promise<PaginatedResult<ReviewEntity>> {
    return this.findAndCount({
      where: { productId, status: 'APPROVED' },
      order: { createdAt: 'DESC' } as never,
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /** Only an approved review can be voted helpful — a pending/rejected one isn't visible to vote on in the first place. */
  async incrementHelpfulByPublicId(publicId: string): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE reviews SET helpful_count = helpful_count + 1 WHERE public_id = ? AND tenant_id = ? AND status = 'APPROVED'`,
      [publicId, this.tenantId],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  /** Recomputed after every moderation change or delete — only APPROVED, non-deleted reviews count. */
  async ratingAggregate(productId: string): Promise<{ average: string; count: number }> {
    const rows = (await this.manager.query(
      `SELECT COALESCE(AVG(rating), 0) AS average, COUNT(*) AS count
         FROM reviews
        WHERE tenant_id = ? AND product_id = ? AND status = 'APPROVED' AND deleted_at IS NULL`,
      [this.tenantId, productId],
    )) as { average: string; count: string }[];
    return { average: Number(rows[0]?.average ?? 0).toFixed(2), count: Number(rows[0]?.count ?? 0) };
  }

  /** Batch reverse of a public-id lookup — internal ids to public ids in another tenant-owned table. */
  async publicIdsFor(table: 'products' | 'customers', internalIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(internalIds)];
    if (unique.length === 0) return new Map();
    const rows = (await this.manager.query(
      `SELECT id, public_id AS publicId FROM \`${table}\` WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [this.tenantId, ...unique],
    )) as { id: string; publicId: string }[];
    return new Map(rows.map((r) => [r.id, r.publicId]));
  }

  /**
   * Verifies `orderItemId` (an internal id — order items have no public id
   * anywhere in this API) actually belongs to this product and customer
   * before the caller grants a verified-purchase badge.
   */
  async orderItemBelongsTo(orderItemId: string, productId: string, customerId: string): Promise<boolean> {
    const rows = (await this.manager.query(
      `SELECT oi.id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = ? AND oi.tenant_id = ? AND oi.product_id = ? AND o.customer_id = ?
        LIMIT 1`,
      [orderItemId, this.tenantId, productId, customerId],
    )) as { id: string }[];
    return rows.length > 0;
  }
}
