import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CustomerAddressEntity, CustomerEntity, WishlistItemEntity } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class CustomerRepository extends TenantScopedRepository<CustomerEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, CustomerEntity, context);
  }

  async findByEmail(storeId: string, emailNormalized: string): Promise<CustomerEntity | null> {
    return this.findOne({ where: { storeId, emailNormalized } });
  }

  async emailExists(storeId: string, emailNormalized: string, excludePublicId?: string): Promise<boolean> {
    const existing = await this.findByEmail(storeId, emailNormalized);
    if (!existing) return false;
    return existing.publicId !== excludePublicId;
  }

  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [storePublicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  /** The tenant's first store — used when a console request omits `storeId` (single-store tenants). */
  async defaultStoreId(): Promise<string | null> {
    const rows = await this.manager.query(`SELECT id FROM stores WHERE tenant_id = ? ORDER BY id ASC LIMIT 1`, [
      this.tenantId,
    ]);
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async storePublicId(storeId: string): Promise<string | null> {
    const map = await this.storePublicIds([storeId]);
    return map.get(storeId) ?? null;
  }

  /**
   * Resolves a public id to an internal id in another tenant-owned table.
   *
   * `table` is always a fixed literal from our own code (never request input),
   * so interpolating it is safe — only `publicId` is a bound parameter.
   */
  async resolvePublicId(table: 'products' | 'product_variants', publicId: string): Promise<string | null> {
    const rows = await this.manager.query(
      `SELECT id FROM \`${table}\` WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [publicId, this.tenantId],
    );
    return (rows as { id: string }[])[0]?.id ?? null;
  }

  async storePublicIds(storeIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(storeIds)];
    if (unique.length === 0) return new Map();
    const rows = (await this.manager.query(
      `SELECT id, public_id AS publicId FROM stores
        WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [this.tenantId, ...unique],
    )) as { id: string; publicId: string }[];
    return new Map(rows.map((r) => [r.id, r.publicId]));
  }

  /** Batch reverse of `resolvePublicId` — internal ids to public ids in another tenant-owned table. */
  async publicIdsFor(table: 'products' | 'product_variants', internalIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(internalIds)];
    if (unique.length === 0) return new Map();
    const rows = (await this.manager.query(
      `SELECT id, public_id AS publicId FROM \`${table}\` WHERE tenant_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [this.tenantId, ...unique],
    )) as { id: string; publicId: string }[];
    return new Map(rows.map((r) => [r.id, r.publicId]));
  }
}

@Injectable()
export class CustomerAddressRepository extends TenantScopedRepository<CustomerAddressEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, CustomerAddressEntity, context);
  }

  async findByCustomer(customerId: string): Promise<CustomerAddressEntity[]> {
    return this.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  /** Unsets the current default of `type` before a new address takes it over. */
  async clearDefault(customerId: string, column: 'isDefaultShipping' | 'isDefaultBilling'): Promise<void> {
    await this.update({ customerId, [column]: true } as never, { [column]: false } as never);
  }
}

@Injectable()
export class WishlistItemRepository extends TenantScopedRepository<WishlistItemEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, WishlistItemEntity, context);
  }

  async findByCustomer(customerId: string): Promise<WishlistItemEntity[]> {
    return this.find({ where: { customerId }, order: { addedAt: 'DESC' } });
  }
}
