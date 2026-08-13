import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { OutboxEventEntity } from '../database/entities/outbox-event.entity';
import type { QueueConfig } from '../config/configuration';
import { QueueName, queuesForEvent } from './queue-names.enum';
import { QueueRegistry } from './queue.registry';

/** Terminal after this many attempts; the row goes to DEAD for manual replay. */
const MAX_ATTEMPTS = 10;

interface OutboxRow {
  id: string;
  event_id: string;
  tenant_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: unknown;
  metadata: unknown;
  attempts: number;
}

/**
 * Polls `outbox_events` and dispatches each event onto its BullMQ queues.
 *
 * Runs only in the worker process (`worker.ts`), never in the API — N API replicas
 * all polling would multiply database load for no benefit.
 *
 * The claim query is the heart of it:
 *
 *   SELECT … WHERE status='PENDING' AND available_at <= NOW(3)
 *   ORDER BY id LIMIT n FOR UPDATE SKIP LOCKED
 *
 * `SKIP LOCKED` is what lets several relay replicas run with **no coordination**:
 * each transaction claims rows the others have not locked and skips the rest
 * instead of blocking on them. Without it, replica B would wait on replica A's
 * locks and throughput would be that of a single worker — or, with a naive
 * `SELECT` then `UPDATE`, both would dispatch the same event and every consumer
 * would see a duplicate.
 *
 * Delivery is **at-least-once**, not exactly-once: a crash between "enqueued to
 * BullMQ" and "marked DISPATCHED" re-delivers. That is deliberate and is why every
 * consumer must be idempotent via `processed_events`. The alternative — marking
 * DISPATCHED before enqueueing — would make it at-most-once and silently *lose*
 * events, which is strictly worse than handling a duplicate.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly config: QueueConfig;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  private dispatchedCount = 0;
  private failedCount = 0;
  private deadCount = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly queues: QueueRegistry,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<QueueConfig>('queue');
  }

  onApplicationBootstrap(): void {
    if (!this.config.outboxRelayEnabled) {
      this.logger.warn('Outbox relay disabled by configuration');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.outboxRelayPollMs);
    this.timer.unref();

    this.logger.log(
      `Outbox relay started (poll ${this.config.outboxRelayPollMs}ms, batch ${this.config.outboxRelayBatch})`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);

    // Let an in-flight batch finish so its rows are not left in DISPATCHING.
    // Bounded, because a pod must still terminate.
    const deadline = Date.now() + 5_000;
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.logger.log(
      `Outbox relay stopped — dispatched: ${this.dispatchedCount}, failed: ${this.failedCount}, dead: ${this.deadCount}`,
    );
  }

  /** Single poll cycle. Overlapping ticks are skipped rather than queued. */
  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    try {
      const claimed = await this.claimBatch();
      if (claimed.length === 0) return;

      // Sequential, not Promise.all: this is the only place that touches the
      // outbox, and unbounded parallel dispatch would spike Redis connections
      // during a backlog drain — exactly when the system is least healthy.
      for (const row of claimed) {
        await this.dispatch(row);
      }
    } catch (error) {
      this.logger.error(
        `Outbox relay tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Atomically claims a batch, flipping it PENDING → DISPATCHING.
   *
   * The `SELECT … FOR UPDATE SKIP LOCKED` and the `UPDATE` are in one transaction,
   * so no other replica can observe or claim the same rows.
   */
  private async claimBatch(): Promise<OutboxRow[]> {
    return this.dataSource.transaction(async (manager) => {
      const rows: OutboxRow[] = await manager.query(
        `SELECT id, event_id, tenant_id, aggregate_type, aggregate_id,
                event_type, event_version, payload, metadata, attempts
           FROM outbox_events
          WHERE status = 'PENDING'
            AND available_at <= NOW(3)
          ORDER BY id
          LIMIT ?
          FOR UPDATE SKIP LOCKED`,
        [this.config.outboxRelayBatch],
      );

      if (rows.length === 0) return [];

      await manager.query(
        `UPDATE outbox_events
            SET status = 'DISPATCHING', attempts = attempts + 1
          WHERE id IN (${rows.map(() => '?').join(',')})`,
        rows.map((row) => row.id),
      );

      return rows;
    });
  }

  private async dispatch(row: OutboxRow): Promise<void> {
    const targets = queuesForEvent(row.event_type);

    try {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const metadata =
        typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});

      const jobData = {
        eventId: row.event_id,
        eventType: row.event_type,
        eventVersion: row.event_version,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        // Carried explicitly: the processor has no HTTP request, so this is the
        // only way tenant context and tracing survive the hop.
        tenantId: row.tenant_id,
        correlationId: (metadata as { correlationId?: string }).correlationId ?? null,
        causationId: row.event_id,
        payload,
        metadata,
      };

      for (const queueName of targets) {
        const queue: Queue = this.queues.get(queueName);
        await queue.add(row.event_type, jobData, {
          // Deterministic job id: if this row is re-dispatched after a crash,
          // BullMQ deduplicates instead of enqueueing a second copy.
          //
          // `_` and not `:` — BullMQ rejects a colon in a custom id because it uses
          // `:` internally to build its own Redis key structure.
          jobId: `${row.event_id}_${queueName}`,
          removeOnComplete: { age: 3_600, count: 1_000 },
          removeOnFail: { age: 86_400 },
        });
      }

      await this.dataSource.query(
        `UPDATE outbox_events
            SET status = 'DISPATCHED', dispatched_at = NOW(3), last_error = NULL
          WHERE id = ?`,
        [row.id],
      );

      this.dispatchedCount += 1;
    } catch (error) {
      await this.handleDispatchFailure(row, error);
    }
  }

  /**
   * Exponential backoff, then DEAD.
   *
   * A DEAD row is never silently dropped: it stays queryable, is surfaced in the
   * platform admin UI, and can be reset to PENDING to replay once the underlying
   * bug is fixed. That replay path is the reason the outbox is worth having — it
   * turns "we lost a day of events" into "we re-drove a day of events".
   */
  private async handleDispatchFailure(row: OutboxRow, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = row.attempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      this.deadCount += 1;
      this.logger.error(
        `Outbox event ${row.event_id} (${row.event_type}) DEAD after ${attempts} attempts: ${message}`,
      );
      await this.dataSource.query(
        `UPDATE outbox_events SET status = 'DEAD', last_error = ? WHERE id = ?`,
        [message.slice(0, 1_000), row.id],
      );
      return;
    }

    this.failedCount += 1;
    const backoffSeconds = Math.min(2 ** attempts, 300);

    this.logger.warn(
      `Outbox event ${row.event_id} failed (attempt ${attempts}/${MAX_ATTEMPTS}), retrying in ${backoffSeconds}s: ${message}`,
    );

    await this.dataSource.query(
      `UPDATE outbox_events
          SET status = 'PENDING',
              available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND),
              last_error = ?
        WHERE id = ?`,
      [backoffSeconds, message.slice(0, 1_000), row.id],
    );
  }

  /**
   * Relay lag: age of the oldest undispatched event.
   *
   * The single most important health signal in the system. Rising lag means
   * committed state and its downstream effects are drifting apart — orders placed
   * but stock not decremented, payments captured but no confirmation sent.
   */
  async getLagSeconds(): Promise<number> {
    const [result] = (await this.dataSource.query(
      `SELECT TIMESTAMPDIFF(SECOND, MIN(created_at), NOW(3)) AS lag
         FROM outbox_events
        WHERE status IN ('PENDING','DISPATCHING')`,
    )) as [{ lag: number | null }];

    return result?.lag ?? 0;
  }

  get stats(): { dispatched: number; failed: number; dead: number } {
    return { dispatched: this.dispatchedCount, failed: this.failedCount, dead: this.deadCount };
  }
}
