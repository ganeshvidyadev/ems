import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { TenantThemeEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class TenantThemeRepository extends TenantScopedRepository<TenantThemeEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, TenantThemeEntity, context);
  }

  async findByStore(storeId: string): Promise<TenantThemeEntity[]> {
    return this.find({ where: { storeId }, order: { createdAt: 'DESC' } });
  }

  /** The one live theme a store's storefront actually renders. */
  async findPublished(storeId: string): Promise<TenantThemeEntity | null> {
    return this.findOne({ where: { storeId, status: 'PUBLISHED' } });
  }

  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [storePublicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async storePublicId(storeId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT public_id AS publicId FROM stores WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [storeId, this.tenantId],
    );
    return (rows as { publicId: string }[])[0]?.publicId ?? null;
  }
}
