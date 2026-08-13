import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { LoggingConfig } from '../../config/configuration';

export type LogCollection =
  | 'api_logs'
  | 'error_logs'
  | 'auth_logs'
  | 'activity_logs'
  | 'webhook_logs'
  | 'job_logs'
  | 'third_party_logs';

interface BufferedDocument {
  collection: LogCollection;
  document: Record<string, unknown>;
}

/**
 * Bounded, batching, fire-and-forget writer for MongoDB log collections.
 *
 * The brief requires that logging never affect API performance. Three properties
 * deliver that, and each one matters on its own:
 *
 *  1. **The request never awaits a write.** `enqueue` is synchronous and only
 *     pushes onto an array. A Mongo round-trip on the response path would add its
 *     latency to every single request and would make a slow log store into a slow
 *     API.
 *
 *  2. **The buffer is bounded, and overflow drops.** An unbounded queue in front of
 *     a struggling database is just a slower memory leak — it converts a logging
 *     outage into an OOM kill. Dropping and counting is the honest failure mode;
 *     the drop counter is exported as a metric so the loss is visible rather than
 *     silent.
 *
 *  3. **Writes are unordered bulk with `w: 0`.** Nothing here is a source of truth
 *     (docs/02 §20), so waiting for an acknowledgement buys durability we do not
 *     need at a cost we do not want. `ordered: false` means one bad document
 *     cannot block the rest of the batch.
 */
@Injectable()
export class LogBufferService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LogBufferService.name);
  private readonly config: LoggingConfig;

  private buffer: BufferedDocument[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  private droppedCount = 0;
  private writtenCount = 0;
  private failedFlushCount = 0;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<LoggingConfig>('logging');
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.warn('Mongo logging is disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);

    // Without unref the interval keeps the event loop alive and the process will
    // not exit on SIGTERM.
    this.timer.unref();
  }

  /**
   * Queues a document. Never throws and never blocks — a logging failure must not
   * become a request failure.
   */
  enqueue(collection: LogCollection, document: Record<string, unknown>): void {
    if (!this.config.enabled) return;

    if (this.buffer.length >= this.config.bufferSize) {
      this.droppedCount += 1;
      // Logged once per 1000 drops: logging every drop would itself be the
      // amplification problem we are trying to avoid.
      if (this.droppedCount % 1_000 === 1) {
        this.logger.warn(
          `Log buffer full (${this.config.bufferSize}); dropped ${this.droppedCount} documents so far`,
        );
      }
      return;
    }

    this.buffer.push({ collection, document });

    // Flush early when a burst fills a batch, rather than waiting out the interval.
    if (this.buffer.length >= this.config.flushBatch) {
      setImmediate(() => void this.flush());
    }
  }

  /** Drains the buffer into Mongo. Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    if (this.connection.readyState !== 1) return;

    this.flushing = true;

    // Swap the buffer out first so writers keep filling a fresh array while this
    // batch is in flight.
    const batch = this.buffer;
    this.buffer = [];

    try {
      const byCollection = new Map<LogCollection, Record<string, unknown>[]>();
      for (const entry of batch) {
        const list = byCollection.get(entry.collection);
        if (list) list.push(entry.document);
        else byCollection.set(entry.collection, [entry.document]);
      }

      await Promise.all(
        [...byCollection.entries()].map(async ([collection, documents]) => {
          try {
            await this.connection
              .collection(collection)
              .insertMany(documents, { ordered: false, writeConcern: { w: 0 } });
            this.writtenCount += documents.length;
          } catch (error) {
            this.failedFlushCount += 1;
            // Deliberately not re-queued. Retrying into a database that is already
            // failing turns a transient outage into unbounded growth, and these
            // documents are disposable by design.
            this.logger.warn(
              `Failed to write ${documents.length} documents to ${collection}: ` +
                (error instanceof Error ? error.message : String(error)),
            );
          }
        }),
      );
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Final flush on shutdown.
   *
   * Bounded by a timeout: a pod that will not terminate because it is trying to
   * write logs is worse than a pod that loses its last second of logs.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);

    await Promise.race([
      this.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);

    this.logger.log(
      `Log buffer shut down — written: ${this.writtenCount}, dropped: ${this.droppedCount}, failed flushes: ${this.failedFlushCount}`,
    );
  }

  /** Exposed to `/metrics`; buffer depth and drop rate are the health signals. */
  get stats(): {
    buffered: number;
    written: number;
    dropped: number;
    failedFlushes: number;
    capacity: number;
  } {
    return {
      buffered: this.buffer.length,
      written: this.writtenCount,
      dropped: this.droppedCount,
      failedFlushes: this.failedFlushCount,
      capacity: this.config.bufferSize,
    };
  }
}
