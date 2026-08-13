import { Column, Entity, Index } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/**
 * Saga steps, in execution order.
 *
 * `sequence` is stored on the row rather than derived from this array's index, so
 * reordering the constant later cannot silently reorder in-flight sagas.
 */
export const PROVISIONING_STEPS = [
  'TENANT_ACTIVATED',
  'STORE_CREATED',
  'SUBDOMAIN_ASSIGNED',
  'THEME_CLONED',
  'CATALOG_SEEDED',
  'STORAGE_PREPARED',
  'WELCOME_SENT',
] as const;
export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];

export const PROVISIONING_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
] as const;
export type ProvisioningStatus = (typeof PROVISIONING_STATUSES)[number];

/**
 * One row per (tenant, step) of the provisioning saga.
 *
 * Per-step rows rather than the single `tenants.provisioning_step` cursor, because a
 * cursor cannot express "steps 1–3 done, step 4 failed with this error, and it is
 * retryable". Both things depend on that:
 *
 *  - **Resumption.** After a worker crash the saga restarts at the first incomplete step
 *    instead of replaying from the beginning and creating a second DNS record.
 *  - **The merchant-facing wizard.** Showing which step failed and whether it will retry
 *    is what avoids the "your store is being created" dead end that the architecture doc
 *    names as the largest support-volume driver in this product category.
 */
@Entity('provisioning_tasks')
@TenantScoped()
export class ProvisioningTaskEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  step!: ProvisioningStep;

  @Index('idx_provisioning_tenant_seq')
  @Column({ type: 'smallint', unsigned: true })
  sequence!: number;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: ProvisioningStatus;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  attempts!: number;

  /**
   * Whether a failure is worth retrying.
   *
   * A DNS timeout is transient; "that subdomain is taken" is not, and retrying it forever
   * would burn attempts while hiding a problem only the merchant can fix. The wizard uses
   * this to decide between "retrying…" and "here is what to do".
   */
  @Column({ ...BOOLEAN_COLUMN, default: 1 })
  retryable!: boolean;

  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true })
  errorMessage!: string | null;

  /**
   * What the step created — store id, domain id, theme id.
   *
   * This is what makes a retry idempotent: the step checks its own prior output before
   * acting, so re-running after a crash adopts the existing record instead of creating a
   * duplicate.
   */
  @Column({ type: 'json', nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ name: 'started_at', ...DATETIME3, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', ...DATETIME3, nullable: true })
  finishedAt!: Date | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  get isTerminal(): boolean {
    return this.status === 'COMPLETED' || this.status === 'SKIPPED';
  }

  /** A FAILED-but-retryable step is still eligible; a non-retryable one needs a human. */
  get isResumable(): boolean {
    return this.status === 'PENDING' || (this.status === 'FAILED' && this.retryable);
  }
}
