import { Column, Entity, Index } from 'typeorm';
import { NumericIdEntity, DATETIME3, BOOLEAN_COLUMN } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const CHANNEL_TYPES = [
  'AMAZON',
  'FLIPKART',
  'EBAY',
  'FACEBOOK',
  'INSTAGRAM',
  'WHATSAPP',
  'GOOGLE',
  'STUB',
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_STATUSES = [
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'ERROR',
  'TOKEN_EXPIRED',
  'SUSPENDED',
] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export interface ChannelSettings {
  /** Merchant category → channel category, e.g. `{ "Shoes": "11450" }` for eBay. */
  categoryMapping?: Record<string, string>;
  /** Percent markup/markdown applied to the store price before publishing. */
  priceAdjustmentPercent?: string;
  /** Flat minor-currency amount added after the percent adjustment. */
  priceAdjustmentFlatMinor?: string;
}

/**
 * One connected external sales channel per store (docs/02 §17). No
 * `public_id` — the doc's own DDL never gives this table one, the same as
 * `tenant_domains`, so it is addressed by internal id (see
 * `DomainController` from Phase 8 for the identical precedent).
 */
@Entity('channels')
@TenantScoped()
export class ChannelEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: ChannelType;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index('idx_channels_sync')
  @Column({ type: 'varchar', length: 32, default: 'DISCONNECTED' })
  status!: ChannelStatus;

  /** AES-256-GCM ciphertext of the OAuth token set (access + refresh + scopes), via `CryptoService`. */
  @Column({ name: 'credentials_encrypted', type: 'varbinary', length: 4096, nullable: true })
  credentialsEncrypted!: Buffer | null;

  @Column({ name: 'external_account_id', type: 'varchar', length: 191, nullable: true })
  externalAccountId!: string | null;

  /** e.g. an eBay marketplace id (`EBAY_US`) or Amazon seller-central region. */
  @Column({ name: 'marketplace_id', type: 'varchar', length: 64, nullable: true })
  marketplaceId!: string | null;

  @Column({ type: 'json', nullable: true })
  settings!: ChannelSettings | null;

  @Column({ name: 'inventory_buffer', type: 'int', unsigned: true, default: 0 })
  inventoryBuffer!: number;

  @Column({ name: 'auto_publish', ...BOOLEAN_COLUMN, default: 0 })
  autoPublish!: boolean;

  @Column({ name: 'auto_import_orders', ...BOOLEAN_COLUMN, default: 1 })
  autoImportOrders!: boolean;

  @Column({ name: 'last_sync_at', ...DATETIME3, nullable: true })
  lastSyncAt!: Date | null;

  /** Opaque cursor into the channel's own order-list API — resumed on the next import run. */
  @Column({ name: 'last_order_cursor', type: 'varchar', length: 191, nullable: true })
  lastOrderCursor!: string | null;

  @Column({ name: 'last_error', type: 'varchar', length: 1000, nullable: true })
  lastError!: string | null;

  @Index('idx_channels_token_expiry')
  @Column({ name: 'token_expires_at', ...DATETIME3, nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  get isConnected(): boolean {
    return this.status === 'CONNECTED';
  }

  /** Within the alerting window — see `ChannelTokenService`'s own threshold. */
  isTokenExpiringSoon(withinMs: number): boolean {
    return this.tokenExpiresAt !== null && this.tokenExpiresAt.getTime() - Date.now() <= withinMs;
  }
}
