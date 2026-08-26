import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ProductMediaEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class MediaRepository extends TenantScopedRepository<ProductMediaEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ProductMediaEntity, context);
  }

  /** Resolves a product's internal id from its public id, scoped to the current tenant. */
  async resolveProductId(productPublicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM products WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [productPublicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async clearPrimary(productId: string): Promise<void> {
    await this.manager.query(
      `UPDATE product_media SET is_primary = 0 WHERE tenant_id = ? AND product_id = ?`,
      [this.tenantId, productId],
    );
  }
}
