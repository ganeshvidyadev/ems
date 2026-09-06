import { Column, Entity } from 'typeorm';
import { DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const LOYALTY_TRANSACTION_TYPES = ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REVERSAL'] as const;
export type LoyaltyTransactionType = (typeof LOYALTY_TRANSACTION_TYPES)[number];

/**
 * Append-only points ledger. `CustomerEntity.loyaltyPoints` is a cache of
 * `SUM(points_delta)`, maintained by whichever service appends a row here —
 * never written to directly, for the same reason `inventory_movements` backs
 * `inventory_levels` instead of the other way round.
 */
@Entity('loyalty_transactions')
@TenantScoped()
export class LoyaltyTransactionEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: LoyaltyTransactionType;

  @Column({ name: 'points_delta', type: 'int' })
  pointsDelta!: number;

  @Column({ name: 'points_after', type: 'int' })
  pointsAfter!: number;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'expires_at', ...DATETIME3, nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}
