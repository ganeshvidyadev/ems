import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/**
 * One pre-aggregated (tenant, store, date, channel) sales bucket (docs/02 §19).
 *
 * Composite primary key, no surrogate `id`: a row is fully identified by what
 * it aggregates, and the rollup job upserts it (`ON DUPLICATE KEY UPDATE`)
 * rather than ever creating a second row for the same bucket. Every report
 * in this phase reads from this table, never from `orders` directly — the
 * exit criterion this exists for.
 *
 * `@TenantScoped()` on the normal (non-nullable) column: the rollup job runs
 * per tenant under `runAsTenant`, so `TenantGuardSubscriber` stamping/asserting
 * `tenant_id` on insert is exactly the safety net every other tenant write gets.
 */
@Entity('daily_sales_rollup')
@TenantScoped()
export class DailySalesRollupEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @PrimaryColumn({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  @Index('idx_daily_sales_date')
  @PrimaryColumn({ type: 'date' })
  date!: string;

  @PrimaryColumn({ type: 'varchar', length: 32, default: 'ALL' })
  channel!: string;

  @Column({ name: 'orders_count', type: 'int', unsigned: true, default: 0 })
  ordersCount!: number;

  @Column({ name: 'items_count', type: 'int', unsigned: true, default: 0 })
  itemsCount!: number;

  /** Minor units. Never a float — see the Money value object in @ems/kernel. */
  @Column({ name: 'gross_minor', type: 'bigint', default: 0 })
  grossMinor!: string;

  @Column({ name: 'discount_minor', type: 'bigint', default: 0 })
  discountMinor!: string;

  @Column({ name: 'tax_minor', type: 'bigint', default: 0 })
  taxMinor!: string;

  @Column({ name: 'shipping_minor', type: 'bigint', default: 0 })
  shippingMinor!: string;

  @Column({ name: 'refund_minor', type: 'bigint', default: 0 })
  refundMinor!: string;

  @Column({ name: 'net_minor', type: 'bigint', default: 0 })
  netMinor!: string;

  @Column({ name: 'cogs_minor', type: 'bigint', default: 0 })
  cogsMinor!: string;

  @Column({ name: 'new_customers', type: 'int', unsigned: true, default: 0 })
  newCustomers!: number;

  @Column({ name: 'returning_customers', type: 'int', unsigned: true, default: 0 })
  returningCustomers!: number;

  @Column({ name: 'cancelled_count', type: 'int', unsigned: true, default: 0 })
  cancelledCount!: number;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;
}
