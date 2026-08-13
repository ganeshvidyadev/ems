import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_QUEUE_CLIENT } from '../common/redis/redis.module';
import { ALL_QUEUES, QUEUE_SETTINGS, type QueueName } from './queue-names.enum';

/**
 * Owns one BullMQ `Queue` per registered name.
 *
 * A registry rather than a `@InjectQueue()` per consumer: the outbox relay routes
 * to queues chosen at runtime from the event type, so it needs lookup by name.
 * Twelve constructor injections that then get switched over would be the same
 * thing written less directly.
 */
@Injectable()
export class QueueRegistry implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QueueRegistry.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis) {}

  onApplicationBootstrap(): void {
    for (const name of ALL_QUEUES) {
      const settings = QUEUE_SETTINGS[name];

      this.queues.set(
        name,
        new Queue(name, {
          connection: this.connection,
          defaultJobOptions: {
            attempts: settings.attempts,
            backoff: { type: 'exponential', delay: settings.backoffMs || 1_000 },
            // Completed jobs are pruned aggressively; failures are kept a day so
            // there is something to look at when someone asks why an order stalled.
            removeOnComplete: { age: 3_600, count: 1_000 },
            removeOnFail: { age: 86_400, count: 5_000 },
          },
        }),
      );
    }

    this.logger.log(`Registered ${this.queues.size} queues`);
  }

  get(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(
        `Queue '${name}' is not registered. Add it to QueueName in queue-names.enum.ts.`,
      );
    }
    return queue;
  }

  /** Depth per queue — the primary saturation metric for `/metrics`. */
  async depths(): Promise<Record<string, { waiting: number; active: number; failed: number; delayed: number }>> {
    const result: Record<string, { waiting: number; active: number; failed: number; delayed: number }> = {};

    await Promise.all(
      [...this.queues.entries()].map(async ([name, queue]) => {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
        result[name] = {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }),
    );

    return result;
  }

  async onApplicationShutdown(): Promise<void> {
    // Close queues so in-flight jobs are released back rather than left `active`
    // until BullMQ's stalled-job timeout expires.
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.logger.log('Queues closed');
  }
}
