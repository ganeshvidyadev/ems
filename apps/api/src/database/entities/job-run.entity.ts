import { Column, Entity } from 'typeorm';
import { NumericIdEntity, DATETIME3 } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

export const JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Durable record of a long-running job (bulk import, export, report).
 *
 * BullMQ already tracks jobs, but only in Redis and only briefly — a merchant
 * asking "did last Tuesday's 50k-product import finish, and which rows failed?"
 * needs an answer that outlives Redis retention and survives a flush.
 *
 * `COMPLETED_WITH_ERRORS` is a distinct status on purpose. A 50k-row import where
 * 12 rows failed is neither a success nor a failure, and collapsing it into either
 * one is how merchants end up with silently missing products.
 */
@Entity('job_runs')
@TenantScoped({ allowNullTenant: true })
export class JobRunEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ name: 'job_type', type: 'varchar', length: 64 })
  jobType!: string;

  @Column({ type: 'varchar', length: 32, default: 'QUEUED' })
  status!: JobStatus;

  @Column({ name: 'queue_job_id', type: 'varchar', length: 120, nullable: true })
  queueJobId!: string | null;

  @Column({ name: 'input_params', type: 'json', nullable: true })
  inputParams!: Record<string, unknown> | null;

  @Column({ name: 'total_rows', type: 'int', unsigned: true, nullable: true })
  totalRows!: number | null;

  @Column({ name: 'processed_rows', type: 'int', unsigned: true, default: 0 })
  processedRows!: number;

  @Column({ name: 'success_rows', type: 'int', unsigned: true, default: 0 })
  successRows!: number;

  @Column({ name: 'failed_rows', type: 'int', unsigned: true, default: 0 })
  failedRows!: number;

  /**
   * Downloadable per-row error report. Essential rather than nice-to-have: "412
   * rows failed" without saying which rows and why is unactionable on a 50k-row file.
   */
  @Column({ name: 'error_report_url', type: 'varchar', length: 500, nullable: true })
  errorReportUrl!: string | null;

  @Column({ name: 'output_url', type: 'varchar', length: 500, nullable: true })
  outputUrl!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', ...DATETIME3, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', ...DATETIME3, nullable: true })
  finishedAt!: Date | null;

  @Column({ name: 'requested_by', type: 'bigint', unsigned: true, nullable: true })
  requestedBy!: string | null;

  @Column({ name: 'correlation_id', type: 'char', length: 26, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  get progressPercent(): number {
    if (!this.totalRows || this.totalRows === 0) return 0;
    return Math.min(100, Math.round((this.processedRows / this.totalRows) * 100));
  }

  get isTerminal(): boolean {
    return (
      this.status === 'COMPLETED' ||
      this.status === 'COMPLETED_WITH_ERRORS' ||
      this.status === 'FAILED' ||
      this.status === 'CANCELLED'
    );
  }
}
