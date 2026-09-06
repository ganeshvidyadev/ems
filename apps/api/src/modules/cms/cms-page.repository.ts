import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CmsPageEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class CmsPageRepository extends TenantScopedRepository<CmsPageEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, CmsPageEntity, context);
  }

  async slugExists(storeId: string, slug: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { storeId, slug } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  async findBySlug(storeId: string, slug: string): Promise<CmsPageEntity | null> {
    return this.findOne({ where: { storeId, slug, status: 'PUBLISHED' } });
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
