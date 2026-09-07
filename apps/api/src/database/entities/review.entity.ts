import { Column, DeleteDateColumn, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, BaseEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SPAM'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

@Entity('reviews')
@TenantScoped()
export class ReviewEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true })
  productId!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  /** Presence ⇒ verified purchase; also the uniqueness anchor (one review per purchased line). */
  @Column({ name: 'order_item_id', type: 'bigint', unsigned: true, nullable: true })
  orderItemId!: string | null;

  @Column({ type: 'tinyint', unsigned: true })
  rating!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'author_name', type: 'varchar', length: 120, nullable: true })
  authorName!: string | null;

  @Column({ type: 'json', nullable: true })
  images!: string[] | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: ReviewStatus;

  @Column({ name: 'is_verified_purchase', ...BOOLEAN_COLUMN, default: 0 })
  isVerifiedPurchase!: boolean;

  @Column({ name: 'helpful_count', type: 'int', unsigned: true, default: 0 })
  helpfulCount!: number;

  @Column({ name: 'merchant_reply', type: 'text', nullable: true })
  merchantReply!: string | null;

  @Column({ name: 'merchant_replied_at', ...DATETIME3, nullable: true })
  merchantRepliedAt!: Date | null;

  @Column({ name: 'moderated_by', type: 'bigint', unsigned: true, nullable: true })
  moderatedBy!: string | null;

  @Column({ name: 'moderated_at', ...DATETIME3, nullable: true })
  moderatedAt!: Date | null;

  // `@DeleteDateColumn`, not a plain `@Column` — `repository.softRemove()`
  // throws `MissingDeleteDateColumnError` without it, the same bug found and
  // fixed on ProductEntity/CouponEntity/CustomerEntity earlier this session.
  @DeleteDateColumn({ name: 'deleted_at', ...DATETIME3 })
  deletedAt!: Date | null;
}
