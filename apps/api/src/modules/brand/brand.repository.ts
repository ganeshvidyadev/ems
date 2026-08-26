import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BrandEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class BrandRepository extends TenantScopedRepository<BrandEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, BrandEntity, context);
  }

  async slugExists(slug: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { slug } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }
}
