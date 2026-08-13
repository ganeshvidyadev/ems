import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundError } from '@ems/kernel';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AppConfig } from '../../config/configuration';
import {
  ProvisioningTaskEntity,
  TenantEntity,
  type ProvisioningStep,
} from '../../database/entities';
import { OutboxService } from '../../common/services/outbox.service';
import { MailService } from '../notification/mail.service';
import {
  NonRetryableStepError,
  PROVISIONING_PIPELINE,
  type StepContext,
} from './provisioning.steps';

export interface ProvisioningStatusView {
  tenantId: string;
  tenantStatus: string;
  complete: boolean;
  failed: boolean;
  storefrontUrl: string | null;
  steps: {
    step: ProvisioningStep;
    sequence: number;
    status: string;
    attempts: number;
    retryable: boolean;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }[];
}

/** Attempts before a retryable step is treated as terminal. */
const MAX_STEP_ATTEMPTS = 5;

/**
 * The provisioning saga.
 *
 * This is the highest-risk path in the product: it spans DNS, storage, mail and (in later
 * phases) ACME — all external, all slow, all able to fail halfway. Two properties make it
 * survivable:
 *
 *  1. **Resumable.** Each step owns a row. A crash mid-pipeline leaves completed steps
 *     COMPLETED, so restarting continues from the first incomplete one rather than
 *     replaying from the top and creating a second store or a duplicate DNS record.
 *
 *  2. **Visible.** Per-step status drives the onboarding wizard, so a merchant sees
 *     *which* step failed and whether it will retry — instead of an indefinite "your store
 *     is being created", which the architecture doc names as the biggest support-volume
 *     driver in this product category.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);
  private readonly app: AppConfig;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly outbox: OutboxService,
    configService: ConfigService,
  ) {
    this.app = configService.getOrThrow<AppConfig>('app');
  }

  // =========================================================================
  // Plan
  // =========================================================================

  /**
   * Creates the task rows for a tenant, if they do not already exist.
   *
   * `INSERT IGNORE` against the `(tenant_id, step)` unique key, so calling this twice —
   * which happens whenever a job is re-delivered — is harmless and does not reset progress.
   */
  async plan(tenantId: string): Promise<void> {
    const values = PROVISIONING_PIPELINE.map(() => '(?, ?, ?, ?)').join(',');
    const params = PROVISIONING_PIPELINE.flatMap((definition) => [
      tenantId,
      definition.step,
      definition.sequence,
      'PENDING',
    ]);

    await this.dataSource.query(
      `INSERT IGNORE INTO provisioning_tasks (tenant_id, step, sequence, status)
       VALUES ${values}`,
      params,
    );
  }

  // =========================================================================
  // Run
  // =========================================================================

  /**
   * Runs the pipeline to completion, or until a step fails.
   *
   * Returns whether the tenant is fully provisioned. Safe to call repeatedly: already
   * completed steps are skipped, and a failed-but-retryable step is picked up again.
   */
  async run(tenantId: string): Promise<boolean> {
    await this.plan(tenantId);

    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    // Results of completed steps, so later steps can consume earlier output (the domain
    // step needs the store id) without re-querying.
    const previous = await this.completedResults(tenantId);

    for (const definition of PROVISIONING_PIPELINE) {
      const claimed = await this.claim(tenantId, definition.step);

      if (!claimed) {
        // Either already COMPLETED/SKIPPED, or FAILED and not retryable. A non-retryable
        // failure stops the pipeline — running later steps on a broken foundation produces
        // a store that looks provisioned but is not.
        const blocking = await this.isBlocked(tenantId, definition.step);
        if (blocking) {
          this.logger.warn(
            `Provisioning halted for tenant ${tenantId} at ${definition.step} (not retryable)`,
          );
          return false;
        }
        continue;
      }

      try {
        /*
         * Each step runs in its own transaction.
         *
         * Not one transaction for the whole pipeline: that would hold locks across mail
         * sends and (later) DNS calls, and a failure at step 6 would roll back the store
         * created at step 2 — destroying exactly the progress that makes the saga
         * resumable. Per-step transactions are what let a partial run be resumed rather
         * than restarted.
         */
        const result = await this.dataSource.transaction(async (manager) => {
          const context: StepContext = {
            manager,
            tenantId,
            tenant,
            rootDomain: this.app.rootDomain,
            mail: this.mail,
            previous,
          };
          return definition.run(context);
        });

        previous[definition.step] = result;

        await this.dataSource.query(
          `UPDATE provisioning_tasks
              SET status = ?, result = ?, finished_at = NOW(3), error_message = NULL
            WHERE tenant_id = ? AND step = ?`,
          [
            result['skipped'] === true ? 'SKIPPED' : 'COMPLETED',
            JSON.stringify(result),
            tenantId,
            definition.step,
          ],
        );
      } catch (error) {
        const retryable = !(error instanceof NonRetryableStepError);
        const message = error instanceof Error ? error.message : String(error);

        await this.dataSource.query(
          `UPDATE provisioning_tasks
              SET status = 'FAILED', retryable = ?, error_message = ?, finished_at = NOW(3)
            WHERE tenant_id = ? AND step = ?`,
          [retryable ? 1 : 0, message.slice(0, 1_000), tenantId, definition.step],
        );

        this.logger.error(
          `Provisioning step ${definition.step} failed for tenant ${tenantId} ` +
            `(retryable=${retryable}): ${message}`,
        );

        await this.emitFailure(tenantId, definition.step, message, retryable);
        return false;
      }
    }

    await this.emitCompletion(tenantId, previous);
    return true;
  }

  /**
   * Atomically claims a step.
   *
   * A conditional UPDATE, so two workers racing on the same tenant cannot both execute the
   * same step — exactly one sees `affectedRows === 1`. A read-then-write would let both
   * pass the check and duplicate the side effect.
   *
   * `attempts < MAX` is part of the predicate, so an endlessly-failing retryable step stops
   * claiming itself instead of looping forever.
   */
  private async claim(tenantId: string, step: ProvisioningStep): Promise<boolean> {
    const result = (await this.dataSource.query(
      `UPDATE provisioning_tasks
          SET status = 'RUNNING', attempts = attempts + 1, started_at = NOW(3)
        WHERE tenant_id = ?
          AND step = ?
          AND attempts < ?
          AND (status = 'PENDING' OR (status = 'FAILED' AND retryable = 1)
               OR (status = 'RUNNING' AND started_at < DATE_SUB(NOW(3), INTERVAL 5 MINUTE)))`,
      [tenantId, step, MAX_STEP_ATTEMPTS],
    )) as { affectedRows: number };

    return result.affectedRows === 1;
  }

  /**
   * True when this step is blocking the pipeline.
   *
   * A step that is COMPLETED or SKIPPED is fine to walk past. One that is FAILED and
   * non-retryable — or has exhausted its attempts — must stop the run so the merchant is
   * shown a real error instead of a store that silently never finishes.
   *
   * The stale-RUNNING case is deliberately *not* blocking: `claim` reclaims a RUNNING row
   * older than five minutes, which is how a worker killed mid-step recovers.
   */
  private async isBlocked(tenantId: string, step: ProvisioningStep): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `SELECT status, retryable, attempts FROM provisioning_tasks
        WHERE tenant_id = ? AND step = ? LIMIT 1`,
      [tenantId, step],
    )) as { status: string; retryable: number; attempts: number }[];

    const row = rows[0];
    if (!row) return true;

    if (row.status === 'COMPLETED' || row.status === 'SKIPPED') return false;
    if (row.status === 'FAILED' && row.retryable === 0) return true;
    if (row.attempts >= MAX_STEP_ATTEMPTS) return true;

    return true;
  }

  private async completedResults(
    tenantId: string,
  ): Promise<Record<string, Record<string, unknown>>> {
    const rows = (await this.dataSource.query(
      `SELECT step, result FROM provisioning_tasks
        WHERE tenant_id = ? AND status IN ('COMPLETED','SKIPPED')`,
      [tenantId],
    )) as { step: string; result: string | Record<string, unknown> | null }[];

    const results: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      if (!row.result) continue;
      results[row.step] =
        typeof row.result === 'string'
          ? (JSON.parse(row.result) as Record<string, unknown>)
          : row.result;
    }
    return results;
  }

  // =========================================================================
  // Status
  // =========================================================================

  /** Per-step status for the onboarding wizard. */
  async status(tenantId: string): Promise<ProvisioningStatusView> {
    const tenant = await this.dataSource
      .getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    const tasks = await this.dataSource.getRepository(ProvisioningTaskEntity).find({
      where: { tenantId },
      order: { sequence: 'ASC' },
    });

    const complete =
      tasks.length > 0 && tasks.every((task) => task.status === 'COMPLETED' || task.status === 'SKIPPED');
    const failed = tasks.some((task) => task.status === 'FAILED');

    const domainRows = (await this.dataSource.query(
      `SELECT hostname FROM tenant_domains WHERE tenant_id = ? AND is_primary = 1 LIMIT 1`,
      [tenantId],
    )) as { hostname: string }[];

    return {
      tenantId,
      tenantStatus: tenant.status,
      complete,
      failed,
      storefrontUrl: domainRows[0] ? `https://${domainRows[0].hostname}` : null,
      steps: tasks.map((task) => ({
        step: task.step,
        sequence: task.sequence,
        status: task.status,
        attempts: task.attempts,
        retryable: Boolean(task.retryable),
        error: task.errorMessage,
        startedAt: task.startedAt?.toISOString() ?? null,
        finishedAt: task.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Resets failed steps so a merchant (or admin) can retry after fixing the cause.
   *
   * Clears the attempt counter too — otherwise a step that already exhausted its retries
   * could never be retried, even once the underlying problem is resolved.
   */
  async retry(tenantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE provisioning_tasks
          SET status = 'PENDING', attempts = 0, retryable = 1, error_message = NULL
        WHERE tenant_id = ? AND status = 'FAILED'`,
      [tenantId],
    );
  }

  // =========================================================================
  // Events
  // =========================================================================

  private async emitCompletion(
    tenantId: string,
    results: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.outbox.emit(manager, {
        aggregateType: 'Tenant',
        aggregateId: tenantId,
        eventType: 'tenant.provisioned',
        payload: {
          tenantId,
          storeId: results['STORE_CREATED']?.['storeId'] ?? null,
          hostname: results['SUBDOMAIN_ASSIGNED']?.['hostname'] ?? null,
        },
        tenantId,
      });
    });
  }

  private async emitFailure(
    tenantId: string,
    step: ProvisioningStep,
    message: string,
    retryable: boolean,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.outbox.emit(manager, {
        aggregateType: 'Tenant',
        aggregateId: tenantId,
        eventType: 'tenant.provisioning_failed',
        payload: { tenantId, step, message, retryable },
        tenantId,
      });
    });
  }
}
