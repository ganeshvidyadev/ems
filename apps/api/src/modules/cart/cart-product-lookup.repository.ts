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
}

export interface CartVariantRow {
  id: string;
  publicId: string;
  productId: string;
  sku: string;
  title: string | null;
  priceMinor: string;
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
    if (!row) return null;
    return { ...row, trackInventory: row.trackInventory === 1, allowBackorder: row.allowBackorder === 1 };
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
    return rows[0] ?? null;
  }

  /** Same shape as `getProduct`, keyed by internal id — for callers (checkout) that already
   * hold the internal id from a cart line rather than a request's public id. */
  async getProductById(id: string): Promise<CartProductRow | null> {
    const rows = (await this.manager.query(
      `SELECT p.id, p.public_id AS publicId, p.store_id AS storeId, p.name,
              p.price_minor AS priceMinor, p.currency, p.track_inventory AS trackInventory,
              p.allow_backorder AS allowBackorder, p.status, p.sku, p.tax_class_id AS taxClassId,
              (SELECT url FROM product_media WHERE product_id = p.id ORDER BY is_primary DESC, position ASC LIMIT 1) AS imageUrl
         FROM products p
        WHERE p.id = ? AND p.tenant_id = ? AND p.deleted_at IS NULL
        LIMIT 1`,
      [id, this.tenantId],
    )) as (Omit<CartProductRow, 'trackInventory' | 'allowBackorder'> & {
      trackInventory: number;
      allowBackorder: number;
      taxClassId: string | null;
    })[];

    const row = rows[0];
    if (!row) return null;
    return { ...row, trackInventory: row.trackInventory === 1, allowBackorder: row.allowBackorder === 1 };
  }

  async getVariantById(id: string): Promise<CartVariantRow | null> {
    const rows = (await this.manager.query(
      `SELECT v.id, v.public_id AS publicId, v.product_id AS productId, v.sku, v.title,
              v.price_minor AS priceMinor
         FROM product_variants v
        WHERE v.id = ? AND v.tenant_id = ? AND v.deleted_at IS NULL
        LIMIT 1`,
      [id, this.tenantId],
    )) as CartVariantRow[];
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
