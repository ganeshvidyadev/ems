import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ProductAttributeEntity, ProductAttributeValueEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class AttributeRepository extends TenantScopedRepository<ProductAttributeEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ProductAttributeEntity, context);
  }

  async findByCode(code: string): Promise<ProductAttributeEntity | null> {
    return this.findOne({ where: { code } });
  }
}

@Injectable()
export class AttributeValueRepository extends TenantScopedRepository<ProductAttributeValueEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, ProductAttributeValueEntity, context);
  }

  async replaceForProduct(
    productId: string,
    values: { attributeId: string; valueText: string | null; valueNumber: string | null; valueBool: boolean | null }[],
  ): Promise<void> {
    await this.manager.query(
      `DELETE FROM product_attribute_values WHERE tenant_id = ? AND product_id = ?`,
      [this.tenantId, productId],
    );
    for (const value of values) {
      await this.insert({ ...value, productId });
    }
  }
}
