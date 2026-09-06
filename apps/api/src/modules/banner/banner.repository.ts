import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BannerEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class BannerRepository extends TenantScopedRepository<BannerEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, BannerEntity, context);
  }

  async findByPlacement(storeId: string, placement: BannerEntity['placement']): Promise<BannerEntity[]> {
    return this.find({ where: { storeId, placement }, order: { sortOrder: 'ASC' } });
  }

  async incrementClicks(id: string): Promise<void> {
    await this.manager.query(`UPDATE banners SET click_count = click_count + 1 WHERE id = ? AND tenant_id = ?`, [
      id,
      this.tenantId,
    ]);
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

  async defaultStoreId(): Promise<string | null> {
    const rows = await this.manager.query(`SELECT id FROM stores WHERE tenant_id = ? ORDER BY id ASC LIMIT 1`, [
      this.tenantId,
    ]);
    return (rows as { id: string }[])[0]?.id ?? null;
  }
}
