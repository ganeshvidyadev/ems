import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BusinessRuleError, ConflictError, ForbiddenError, ValidationError } from '@ems/kernel';
import { RequestContextService } from '../../common/services/request-context.service';
import type { CommissionType, InventoryMode, ProductShareEntity } from '../../database/entities';
import { ProductShareRepository, type ProductShareRow } from './product-share.repository';

export interface RequestShareInput {
  /** The supplier's own product, addressed the way every other API surface addresses one. */
  productPublicId: string;
  /** From `resellerDirectory()`'s own response — never a raw internal id. */
  resellerTenantPublicId: string;
  commissionType: CommissionType;
  commissionValue: string;
  platformFeeRate?: string;
  resellerPriceMinor?: string | null;
  minPriceMinor?: string | null;
  allowPriceOverride?: boolean;
  inventoryMode?: InventoryMode;
  allocatedQuantity?: number | null;
}

export interface ResellerDirectoryEntry {
  tenantPublicId: string;
  businessName: string;
  slug: string;
}

interface ShareableProductRow {
  id: string;
  isShareable: number;
  status: string;
  currency: string;
  priceMinor: string;
}

/**
 * The share lifecycle: PENDING (supplier requests) → ACTIVE (reseller
 * accepts) or REJECTED, then ACTIVE ⇄ PAUSED, and REVOKED as the terminal
 * supplier-side "stop sharing" state. Matches `roles.seed.ts`'s permission
 * split exactly: only a supplier can `share`/`unshare` (pause, resume, and
 * revoke are all "the supplier managing their own outgoing share"), only a
 * reseller can `accept`/`reject` a pending request.
 */
@Injectable()
export class ProductShareService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly shares: ProductShareRepository,
    private readonly context: RequestContextService,
  ) {}

  async requestShare(input: RequestShareInput): Promise<ProductShareEntity> {
    const supplierTenantId = this.context.requireTenantId('marketplace share request');

    const product = await this.mustFindShareableProduct(supplierTenantId, input.productPublicId);
    const resellerTenantId = await this.mustResolveEligibleReseller(input.resellerTenantPublicId, product.currency);

    if (supplierTenantId === resellerTenantId) {
      throw new ValidationError('A tenant cannot share a product with itself');
    }

    if (input.allowPriceOverride && input.resellerPriceMinor && input.minPriceMinor) {
      if (BigInt(input.resellerPriceMinor) < BigInt(input.minPriceMinor)) {
        throw new BusinessRuleError('The reseller price is below the supplier\'s MAP floor (min_price_minor)');
      }
    }

    if (input.inventoryMode === 'ALLOCATED' && !input.allocatedQuantity) {
      throw new ValidationError('ALLOCATED inventory mode requires allocatedQuantity');
    }

    const existing = await this.shares.findExisting(supplierTenantId, resellerTenantId, product.id);
    if (existing && existing.status !== 'REJECTED' && existing.status !== 'REVOKED') {
      throw new ConflictError(
        `A share already exists between these tenants for this product (status: ${existing.status})`,
      );
    }

    const share = this.shares.create({
      supplierTenantId,
      resellerTenantId,
      productId: product.id,
      status: 'PENDING',
      commissionType: input.commissionType,
      commissionValue: input.commissionValue,
      platformFeeRate: input.platformFeeRate ?? '0',
      resellerPriceMinor: input.resellerPriceMinor ?? null,
      minPriceMinor: input.minPriceMinor ?? null,
      allowPriceOverride: input.allowPriceOverride ?? false,
      inventoryMode: input.inventoryMode ?? 'SHARED',
      allocatedQuantity: input.allocatedQuantity ?? null,
      requestedBy: this.context.userId ?? null,
    });
    return this.shares.save(share);
  }

  async accept(publicId: string): Promise<ProductShareEntity> {
    const tenantId = this.context.requireTenantId('accept marketplace share');
    const share = await this.shares.findForEitherSideOrFail(publicId, tenantId);
    if (share.resellerTenantId !== tenantId) throw new ForbiddenError('Only the reseller can accept a share request');
    if (share.status !== 'PENDING') throw new BusinessRuleError(`Cannot accept a share in status ${share.status}`);

    share.status = 'ACTIVE';
    share.approvedBy = this.context.userId ?? null;
    share.approvedAt = new Date();
    return this.shares.save(share);
  }

  async reject(publicId: string): Promise<ProductShareEntity> {
    const tenantId = this.context.requireTenantId('reject marketplace share');
    const share = await this.shares.findForEitherSideOrFail(publicId, tenantId);
    if (share.resellerTenantId !== tenantId) throw new ForbiddenError('Only the reseller can reject a share request');
    if (share.status !== 'PENDING') throw new BusinessRuleError(`Cannot reject a share in status ${share.status}`);

    share.status = 'REJECTED';
    return this.shares.save(share);
  }

  async pause(publicId: string): Promise<ProductShareEntity> {
    const share = await this.mustBeSupplierSide(publicId);
    if (share.status !== 'ACTIVE') throw new BusinessRuleError(`Cannot pause a share in status ${share.status}`);
    share.status = 'PAUSED';
    return this.shares.save(share);
  }

  async resume(publicId: string): Promise<ProductShareEntity> {
    const share = await this.mustBeSupplierSide(publicId);
    if (share.status !== 'PAUSED') throw new BusinessRuleError(`Cannot resume a share in status ${share.status}`);
    share.status = 'ACTIVE';
    return this.shares.save(share);
  }

  async revoke(publicId: string): Promise<ProductShareEntity> {
    const share = await this.mustBeSupplierSide(publicId);
    if (share.status === 'REVOKED' || share.status === 'REJECTED') {
      throw new BusinessRuleError(`Share is already terminal (${share.status})`);
    }
    share.status = 'REVOKED';
    share.revokedAt = new Date();
    return this.shares.save(share);
  }

  async listForSupplier(): Promise<ProductShareRow[]> {
    return this.shares.listRowsForSupplier(this.context.requireTenantId('list marketplace shares'));
  }

  async listForReseller(): Promise<ProductShareRow[]> {
    return this.shares.listRowsForReseller(this.context.requireTenantId('list marketplace shares'));
  }

  /** The reseller's "browsable internal catalog" (docs/05 Phase 9) — everything currently sourceable. */
  async browsableCatalog(): Promise<ProductShareRow[]> {
    return this.shares.listActiveRowsForReseller(this.context.requireTenantId('browse marketplace catalog'));
  }

  async getRow(publicId: string): Promise<ProductShareRow> {
    const tenantId = this.context.requireTenantId('get marketplace share');
    // Ensures the caller is one of the two parties before returning display
    // data — `findRowByPublicId` itself is unscoped (it exists to serve both
    // sides with one query), so authorization happens here.
    await this.shares.findForEitherSideOrFail(publicId, tenantId);
    const row = await this.shares.findRowByPublicId(publicId);
    if (!row) throw new ForbiddenError('Share not found'); // unreachable: findForEitherSideOrFail already confirmed it exists
    return row;
  }

  /** Every tenant a supplier could offer a product to — reseller-opted stores, excluding the caller's own tenant. */
  async resellerDirectory(): Promise<ResellerDirectoryEntry[]> {
    const supplierTenantId = this.context.requireTenantId('marketplace reseller directory');
    const rows = (await this.manager.query(
      `SELECT DISTINCT t.public_id AS tenantPublicId, t.business_name AS businessName, t.slug AS slug
         FROM stores s
         JOIN tenants t ON t.id = s.tenant_id
        WHERE s.is_marketplace_reseller = 1 AND s.deleted_at IS NULL
          AND t.status IN ('ACTIVE', 'TRIAL') AND t.deleted_at IS NULL
          AND t.id != ?
        ORDER BY t.business_name ASC`,
      [supplierTenantId],
    )) as ResellerDirectoryEntry[];
    return rows;
  }

  private async mustBeSupplierSide(publicId: string): Promise<ProductShareEntity> {
    const tenantId = this.context.requireTenantId('manage marketplace share');
    const share = await this.shares.findForEitherSideOrFail(publicId, tenantId);
    if (share.supplierTenantId !== tenantId) throw new ForbiddenError('Only the supplier can manage this share');
    return share;
  }

  private async mustFindShareableProduct(supplierTenantId: string, productPublicId: string): Promise<ShareableProductRow> {
    const rows = (await this.manager.query(
      `SELECT id, is_shareable AS isShareable, status, currency, price_minor AS priceMinor
         FROM products
        WHERE public_id = ? AND tenant_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [productPublicId, supplierTenantId],
    )) as ShareableProductRow[];

    const product = rows[0];
    if (!product) throw new ValidationError(`Product '${productPublicId}' does not belong to this tenant`);
    if (product.isShareable !== 1) {
      throw new BusinessRuleError('This product has not opted in to marketplace resale (is_shareable = false)');
    }
    return product;
  }

  /** Resolves the reseller's public tenant id and confirms it's a marketplace-opted, currency-matching tenant. Returns the internal id. */
  private async mustResolveEligibleReseller(resellerTenantPublicId: string, supplierCurrency: string): Promise<string> {
    const rows = (await this.manager.query(
      `SELECT t.id, t.default_currency AS defaultCurrency
         FROM tenants t
         JOIN stores s ON s.tenant_id = t.id
        WHERE t.public_id = ? AND s.is_marketplace_reseller = 1 AND s.deleted_at IS NULL
          AND t.status IN ('ACTIVE', 'TRIAL') AND t.deleted_at IS NULL
        LIMIT 1`,
      [resellerTenantPublicId],
    )) as { id: string; defaultCurrency: string }[];

    const reseller = rows[0];
    if (!reseller) {
      throw new ValidationError(`Tenant '${resellerTenantPublicId}' has no active marketplace-reseller store`);
    }
    if (reseller.defaultCurrency !== supplierCurrency) {
      throw new BusinessRuleError(
        `Currency mismatch: supplier sells in ${supplierCurrency}, reseller's default currency is ${reseller.defaultCurrency}`,
      );
    }
    return reseller.id;
  }
}
