import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { NotFoundError } from '@ems/kernel';
import { ProductShareEntity } from '../../database/entities';

export interface ProductShareRow {
  publicId: string;
  productPublicId: string;
  productName: string;
  supplierTenantPublicId: string;
  supplierBusinessName: string;
  resellerTenantPublicId: string;
  resellerBusinessName: string;
  status: ProductShareEntity['status'];
  commissionType: ProductShareEntity['commissionType'];
  commissionValue: string;
  platformFeeRate: string;
  resellerPriceMinor: string | null;
  minPriceMinor: string | null;
  allowPriceOverride: number;
  inventoryMode: ProductShareEntity['inventoryMode'];
  allocatedQuantity: number | null;
  createdAt: Date;
  approvedAt: Date | null;
  revokedAt: Date | null;
}

const ROW_SELECT = `
  SELECT ps.public_id AS publicId,
         p.public_id AS productPublicId, p.name AS productName,
         st.public_id AS supplierTenantPublicId, st.business_name AS supplierBusinessName,
         rt.public_id AS resellerTenantPublicId, rt.business_name AS resellerBusinessName,
         ps.status, ps.commission_type AS commissionType, ps.commission_value AS commissionValue,
         ps.platform_fee_rate AS platformFeeRate, ps.reseller_price_minor AS resellerPriceMinor,
         ps.min_price_minor AS minPriceMinor, ps.allow_price_override AS allowPriceOverride,
         ps.inventory_mode AS inventoryMode, ps.allocated_quantity AS allocatedQuantity,
         ps.created_at AS createdAt, ps.approved_at AS approvedAt, ps.revoked_at AS revokedAt
    FROM product_shares ps
    JOIN products p ON p.id = ps.product_id
    JOIN tenants st ON st.id = ps.supplier_tenant_id
    JOIN tenants rt ON rt.id = ps.reseller_tenant_id
`;

/**
 * Plain repository, not `TenantScopedRepository` — `product_shares` has no
 * single owning tenant (see the entity's own doc comment). Every read/write
 * here takes the relevant tenant id(s) explicitly rather than trusting
 * ambient context, the same "cross-tenant access is visible in the diff"
 * philosophy `TenantScopedRepository`'s own doc comment describes.
 */
@Injectable()
export class ProductShareRepository {
  private readonly repository: Repository<ProductShareEntity>;

  constructor(@InjectEntityManager() private readonly manager: EntityManager) {
    this.repository = manager.getRepository(ProductShareEntity);
  }

  create(data: Partial<ProductShareEntity>): ProductShareEntity {
    return this.repository.create(data);
  }

  async save(entity: ProductShareEntity): Promise<ProductShareEntity> {
    return this.repository.save(entity);
  }

  async findByPublicId(publicId: string): Promise<ProductShareEntity | null> {
    return this.repository.findOne({ where: { publicId } });
  }

  /** 404s (not 403) if the row exists but belongs to neither tenant — same reasoning as `TenantScopedRepository.findByPublicIdOrFail`. */
  async findForEitherSideOrFail(publicId: string, tenantId: string): Promise<ProductShareEntity> {
    const share = await this.findByPublicId(publicId);
    if (!share || (share.supplierTenantId !== tenantId && share.resellerTenantId !== tenantId)) {
      throw new NotFoundError('ProductShare', publicId);
    }
    return share;
  }

  async findExisting(supplierTenantId: string, resellerTenantId: string, productId: string): Promise<ProductShareEntity | null> {
    return this.repository.findOne({ where: { supplierTenantId, resellerTenantId, productId } });
  }

  async listRowsForSupplier(supplierTenantId: string, status?: ProductShareEntity['status']): Promise<ProductShareRow[]> {
    const clause = status ? 'AND ps.status = ?' : '';
    const params = status ? [supplierTenantId, status] : [supplierTenantId];
    return this.manager.query(
      `${ROW_SELECT} WHERE ps.supplier_tenant_id = ? ${clause} ORDER BY ps.created_at DESC`,
      params,
    ) as Promise<ProductShareRow[]>;
  }

  async listRowsForReseller(resellerTenantId: string, status?: ProductShareEntity['status']): Promise<ProductShareRow[]> {
    const clause = status ? 'AND ps.status = ?' : '';
    const params = status ? [resellerTenantId, status] : [resellerTenantId];
    return this.manager.query(
      `${ROW_SELECT} WHERE ps.reseller_tenant_id = ? ${clause} ORDER BY ps.created_at DESC`,
      params,
    ) as Promise<ProductShareRow[]>;
  }

  /** The reseller's "browsable catalog" — every product currently sourceable from a supplier. */
  async listActiveRowsForReseller(resellerTenantId: string): Promise<ProductShareRow[]> {
    return this.listRowsForReseller(resellerTenantId, 'ACTIVE');
  }

  async findRowByPublicId(publicId: string): Promise<ProductShareRow | null> {
    const rows = (await this.manager.query(`${ROW_SELECT} WHERE ps.public_id = ? LIMIT 1`, [publicId])) as ProductShareRow[];
    return rows[0] ?? null;
  }

  /** The one row (if any) letting `resellerTenantId` sell `productId` right now — checkout's cross-tenant lookup key. */
  async findActiveForResellerAndProduct(resellerTenantId: string, productId: string): Promise<ProductShareEntity | null> {
    return this.repository.findOne({ where: { resellerTenantId, productId, status: 'ACTIVE' } });
  }
}
