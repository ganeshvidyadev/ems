import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CouponEntity, CouponRedemptionEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class CouponRepository extends TenantScopedRepository<CouponEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, CouponEntity, context);
  }

  async findByCode(code: string): Promise<CouponEntity | null> {
    return this.findOne({ where: { code: code.toUpperCase() } });
  }

  async codeExists(code: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findByCode(code);
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  /** Atomically claims one use — `usage_count` only advances if the total cap still allows it. */
  async incrementUsage(id: string): Promise<boolean> {
    const result = (await this.manager.query(
      `UPDATE coupons
          SET usage_count = usage_count + 1
        WHERE id = ? AND tenant_id = ?
          AND (usage_limit_total IS NULL OR usage_count < usage_limit_total)`,
      [id, this.tenantId],
    )) as { affectedRows: number };
    return result.affectedRows > 0;
  }

  async decrementUsage(id: string): Promise<void> {
    await this.manager.query(
      `UPDATE coupons SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId],
    );
  }

  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [storePublicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async storePublicId(storeId: string | null): Promise<string | null> {
    if (!storeId) return null;
    const rows = await this.manager.query(
      `SELECT public_id AS publicId FROM stores WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [storeId, this.tenantId],
    );
    return (rows as { publicId: string }[])[0]?.publicId ?? null;
  }
}

@Injectable()
export class CouponRedemptionRepository extends TenantScopedRepository<CouponRedemptionEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, CouponRedemptionEntity, context);
  }

  async countForCustomer(couponId: string, customerId: string): Promise<number> {
    return this.count({ couponId, customerId } as never);
  }

  async findByOrder(couponId: string, orderId: string): Promise<CouponRedemptionEntity | null> {
    return this.findOne({ where: { couponId, orderId } });
  }
}
