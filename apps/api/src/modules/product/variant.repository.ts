import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ProductVariantEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class VariantRepository extends TenantScopedRepository<ProductVariantEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ProductVariantEntity, context);
  }

  async findByProduct(productId: string): Promise<ProductVariantEntity[]> {
    return this.find({ where: { productId }, order: { position: 'ASC' } });
  }

  async signatureExists(
    productId: string,
    optionSignature: string,
    excludePublicId?: string,
  ): Promise<boolean> {
    const existing = await this.findOne({ where: { productId, optionSignature } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  async skuExists(sku: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findOne({ where: { sku } });
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }
}
