import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';

export interface CartProductRow {
  id: string;
  publicId: string;
  storeId: string;
  name: string;
  priceMinor: string;
  currency: string;
  trackInventory: boolean;
  allowBackorder: boolean;
  status: string;
  sku: string | null;
  imageUrl: string | null;
  taxClassId?: string | null;
  weightGrams?: number | null;
  /** Set only for a marketplace-shared product — the tenant that actually owns and fulfils it. */
  supplierTenantId?: string | null;
}

export interface CartVariantRow {
  id: string;
  publicId: string;
  productId: string;
  sku: string;
  title: string | null;
  priceMinor: string;
  weightGrams?: number | null;
}

export interface WarehouseOrigin {
  id: string;
  postalCode: string;
  countryCode: string;
  addressLine1: string;
  city: string;
  stateCode: string | null;
  name: string;
}

/**
 * Read-only product/variant lookups for the cart.
 *
 * `VariantRepository` lives inside `ProductModule` and isn't exported (only
 * `ProductRepository`/`ProductService` are) — adding an export edge there for
 * one read path is a bigger change than a tenant-scoped raw query here, the
 * same trade-off `CategoryRepository.resolveStoreId` already makes for stores.
 */
@Injectable()
export class CartProductLookupRepository {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
  ) {}

  private get tenantId(): string {
    return this.context.requireTenantId('cart product lookup');
  }

  async getProduct(publicId: string): Promise<CartProductRow | null> {
    const rows = (await this.manager.query(
      `SELECT p.id, p.public_id AS publicId, p.store_id AS storeId, p.name,
              p.price_minor AS priceMinor, p.currency, p.track_inventory AS trackInventory,
              p.allow_backorder AS allowBackorder, p.status, p.sku,
              (SELECT url FROM product_media WHERE product_id = p.id ORDER BY is_primary DESC, position ASC LIMIT 1) AS imageUrl
         FROM products p
        WHERE p.public_id = ? AND p.tenant_id = ? AND p.deleted_at IS NULL
        LIMIT 1`,
      [publicId, this.tenantId],
    )) as (Omit<CartProductRow, 'trackInventory' | 'allowBackorder'> & {
      trackInventory: number;
      allowBackorder: number;
    })[];

    const row = rows[0];
    if (row) return { ...row, trackInventory: row.trackInventory === 1, allowBackorder: row.allowBackorder === 1 };

    return this.getMarketplaceProduct('p.public_id = ?', publicId);
  }

  async getVariant(publicId: string): Promise<CartVariantRow | null> {
    const rows = (await this.manager.query(
      `SELECT v.id, v.public_id AS publicId, v.product_id AS productId, v.sku, v.title,
              v.price_minor AS priceMinor
         FROM product_variants v
        WHERE v.public_id = ? AND v.tenant_id = ? AND v.deleted_at IS NULL
        LIMIT 1`,
      [publicId, this.tenantId],
    )) as CartVariantRow[];

    const row = rows[0];
    if (row) return row;

    return this.getMarketplaceVariant('v.public_id = ?', publicId);
  }

  /** Same shape as `getProduct`, keyed by internal id — for callers (checkout) that already
   * hold the internal id from a cart line rather than a request's public id. */
  async getProductById(id: string): Promise<CartProductRow | null> {
    const rows = (await this.manager.query(
      `SELECT p.id, p.public_id AS publicId, p.store_id AS storeId, p.name,
              p.price_minor AS priceMinor, p.currency, p.track_inventory AS trackInventory,
              p.allow_backorder AS allowBackorder, p.status, p.sku, p.tax_class_id AS taxClassId,
              p.weight_grams AS weightGrams,
              (SELECT url FROM product_media WHERE product_id = p.id ORDER BY is_primary DESC, position ASC LIMIT 1) AS imageUrl
         FROM products p
        WHERE p.id = ? AND p.tenant_id = ? AND p.deleted_at IS NULL
        LIMIT 1`,
      [id, this.tenantId],
    )) as (Omit<CartProductRow, 'trackInventory' | 'allowBackorder'> & {
      trackInventory: number;
      allowBackorder: number;
      taxClassId: string | null;
      weightGrams: number | null;
    })[];

    const row = rows[0];
    if (row) return { ...row, trackInventory: row.trackInventory === 1, allowBackorder: row.allowBackorder === 1 };

    return this.getMarketplaceProduct('p.id = ?', id);
  }

  /**
   * Falls back to a product owned by a **different** tenant, visible to the
   * current (reseller) tenant only through an `ACTIVE` `product_shares` row.
   * Priced at the share's `reseller_price_minor` override when set, else the
   * supplier's own list price — the one place that override is applied, so
   * every caller of `getProduct`/`getProductById` prices a marketplace item
   * correctly with no change to its own logic.
   *
   * A raw query, not the ORM: `product_shares`/`products` are read across a
   * tenant boundary on purpose, and a raw `manager.query` never triggers
   * `TenantGuardSubscriber` (it only inspects entities TypeORM hydrates),
   * which is exactly why every other cross-tenant lookup in this repository
   * already uses one.
   */
  private async getMarketplaceProduct(productPredicate: string, productParam: string): Promise<CartProductRow | null> {
    const rows = (await this.manager.query(
      `SELECT p.id, p.public_id AS publicId, p.store_id AS storeId, p.name,
              COALESCE(s.reseller_price_minor, p.price_minor) AS priceMinor,
              p.currency, p.track_inventory AS trackInventory,
              p.allow_backorder AS allowBackorder, p.status, p.sku, p.tax_class_id AS taxClassId,
              p.weight_grams AS weightGrams, p.tenant_id AS supplierTenantId,
              (SELECT url FROM product_media WHERE product_id = p.id ORDER BY is_primary DESC, position ASC LIMIT 1) AS imageUrl
         FROM product_shares s
         JOIN products p ON p.id = s.product_id
        WHERE s.reseller_tenant_id = ? AND s.status = 'ACTIVE' AND ${productPredicate} AND p.deleted_at IS NULL
        LIMIT 1`,
      [this.tenantId, productParam],
    )) as (Omit<CartProductRow, 'trackInventory' | 'allowBackorder'> & {
      trackInventory: number;
      allowBackorder: number;
      taxClassId: string | null;
      weightGrams: number | null;
      supplierTenantId: string;
    })[];

    const row = rows[0];
    if (!row) return null;
    return { ...row, trackInventory: row.trackInventory === 1, allowBackorder: row.allowBackorder === 1 };
  }

  async getVariantById(id: string): Promise<CartVariantRow | null> {
    const rows = (await this.manager.query(
      `SELECT v.id, v.public_id AS publicId, v.product_id AS productId, v.sku, v.title,
              v.price_minor AS priceMinor, v.weight_grams AS weightGrams
         FROM product_variants v
        WHERE v.id = ? AND v.tenant_id = ? AND v.deleted_at IS NULL
        LIMIT 1`,
      [id, this.tenantId],
    )) as CartVariantRow[];

    const row = rows[0];
    if (row) return row;

    return this.getMarketplaceVariant('v.id = ?', id);
  }

  /**
   * A variant of a marketplace-shared product — no per-variant price
   * override exists in the schema (`product_shares.reseller_price_minor`
   * is per-product), so this passes the supplier's own variant price
   * through unchanged.
   */
  private async getMarketplaceVariant(variantPredicate: string, variantParam: string): Promise<CartVariantRow | null> {
    const rows = (await this.manager.query(
      `SELECT v.id, v.public_id AS publicId, v.product_id AS productId, v.sku, v.title,
              v.price_minor AS priceMinor, v.weight_grams AS weightGrams
         FROM product_variants v
         JOIN product_shares s ON s.product_id = v.product_id
        WHERE s.reseller_tenant_id = ? AND s.status = 'ACTIVE' AND ${variantPredicate} AND v.deleted_at IS NULL
        LIMIT 1`,
      [this.tenantId, variantParam],
    )) as CartVariantRow[];
    return rows[0] ?? null;
  }

  /** The store's default (or highest-priority active) warehouse — the shipment's origin. */
  async defaultWarehouseOrigin(storeId: string): Promise<WarehouseOrigin | null> {
    const rows = (await this.manager.query(
      `SELECT id, postal_code AS postalCode, country_code AS countryCode,
              address_line1 AS addressLine1, city, state_code AS stateCode, name
         FROM warehouses
        WHERE tenant_id = ? AND is_active = 1 AND (store_id = ? OR store_id IS NULL)
          AND deleted_at IS NULL AND postal_code IS NOT NULL
        ORDER BY is_default DESC, priority ASC
        LIMIT 1`,
      [this.tenantId, storeId],
    )) as WarehouseOrigin[];
    return rows[0] ?? null;
  }

  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = (await this.manager.query(
      `SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [storePublicId, this.tenantId],
    )) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  async storePublicId(storeId: string): Promise<string | null> {
    const rows = (await this.manager.query(
      `SELECT public_id AS publicId FROM stores WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [storeId, this.tenantId],
    )) as { publicId: string }[];
    return rows[0]?.publicId ?? null;
  }
}
