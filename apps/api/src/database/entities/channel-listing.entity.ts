import { Column, Entity, Index } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const CHANNEL_LISTING_STATUSES = [
  'PENDING',
  'PUBLISHING',
  'LIVE',
  'PAUSED',
  'REJECTED',
  'ERROR',
  'DELISTED',
] as const;
export type ChannelListingStatus = (typeof CHANNEL_LISTING_STATUSES)[number];

/**
 * One product (or variant) published to one channel (docs/02 §17). No
 * `public_id` — same reasoning as `ChannelEntity`.
 */
@Entity('channel_listings')
@TenantScoped()
export class ChannelListingEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Index('idx_channel_listings_status')
  @Column({ name: 'channel_id', type: 'bigint', unsigned: true })
  channelId!: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ name: 'variant_id', type: 'bigint', unsigned: true, nullable: true })
  variantId!: string | null;

  @Index('idx_channel_listings_external')
  @Column({ name: 'external_listing_id', type: 'varchar', length: 191, nullable: true })
  externalListingId!: string | null;

  @Column({ name: 'external_sku', type: 'varchar', length: 191, nullable: true })
  externalSku!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: ChannelListingStatus;

  @Column({ name: 'channel_price_minor', type: 'bigint', nullable: true })
  channelPriceMinor!: string | null;

  @Column({ name: 'channel_title', type: 'varchar', length: 500, nullable: true })
  channelTitle!: string | null;

  @Column({ name: 'category_mapping', type: 'varchar', length: 191, nullable: true })
  categoryMapping!: string | null;

  @Column({ name: 'last_published_at', ...DATETIME3, nullable: true })
  lastPublishedAt!: Date | null;

  @Index('idx_channel_listings_inventory_sync')
  @Column({ name: 'last_inventory_sync_at', ...DATETIME3, nullable: true })
  lastInventorySyncAt!: Date | null;

  /** What the channel last confirmed it believes the stock is — drift detection compares this against our own current level. */
  @Column({ name: 'synced_quantity', type: 'int', nullable: true })
  syncedQuantity!: number | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  get isLive(): boolean {
    return this.status === 'LIVE';
  }
}
