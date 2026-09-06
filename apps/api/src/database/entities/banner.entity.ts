import { Column, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const BANNER_PLACEMENTS = ['HOME_HERO', 'HOME_STRIP', 'CATEGORY_TOP', 'SIDEBAR', 'POPUP'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/** No `public_id`: a banner is always addressed within its store's placement list, never alone. */
@Entity('banners')
@TenantScoped()
export class BannerEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ type: 'varchar', length: 64 })
  placement!: BannerPlacement;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle!: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 1000, nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'mobile_image_url', type: 'varchar', length: 1000, nullable: true })
  mobileImageUrl!: string | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 255, nullable: true })
  altText!: string | null;

  @Column({ name: 'link_url', type: 'varchar', length: 1000, nullable: true })
  linkUrl!: string | null;

  @Column({ name: 'cta_label', type: 'varchar', length: 64, nullable: true })
  ctaLabel!: string | null;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @Column({ name: 'starts_at', ...DATETIME3, nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'ends_at', ...DATETIME3, nullable: true })
  endsAt!: Date | null;

  @Column({ name: 'is_active', ...BOOLEAN_COLUMN, default: 1 })
  isActive!: boolean;

  @Column({ name: 'click_count', type: 'int', unsigned: true, default: 0 })
  clickCount!: number;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  /** Whether the banner should show *right now* — active flag plus the scheduling window. */
  get isCurrentlyLive(): boolean {
    if (!this.isActive) return false;
    const now = Date.now();
    if (this.startsAt && this.startsAt.getTime() > now) return false;
    if (this.endsAt && this.endsAt.getTime() < now) return false;
    return true;
  }
}
