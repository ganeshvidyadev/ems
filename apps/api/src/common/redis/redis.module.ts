import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RedisConfig, RedisQueueConfig } from '../../config/configuration';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
/** BullMQ requires its own connection with `maxRetriesPerRequest: null`. */
export const REDIS_QUEUE_CLIENT = Symbol('REDIS_QUEUE_CLIENT');

function buildOptions(config: RedisConfig) {
  return {
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    // Every key is environment-prefixed so a misconfigured REDIS_URL cannot let
    // staging read or evict production sessions and carts (docs/02 §21).
    keyPrefix: `${config.keyPrefix}:`,
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
  };
}

/**
 * Two Redis clients, deliberately.
 *
 * The application client keeps `maxRetriesPerRequest` at its default so a command
 * against a dead Redis fails fast and the request can degrade instead of hanging.
 * BullMQ requires the opposite — it uses blocking reads (`BRPOPLPUSH`) that must be
 * allowed to sit indefinitely, and it refuses to start unless the setting is
 * `null`. Sharing one client would mean choosing one behaviour and breaking the
 * other.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<RedisConfig>('redis');
        const client = new Redis({ ...buildOptions(config), maxRetriesPerRequest: 3 });
        const logger = new Logger('Redis');

        client.on('error', (error) => logger.error(`Redis error: ${error.message}`));
        client.on('connect', () => logger.log(`Connected to ${config.host}:${config.port}`));
        client.on('reconnecting', () => logger.warn('Reconnecting…'));

        return client;
      },
    },
    {
      provide: REDIS_QUEUE_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // A separate instance with `noeviction`, not just a separate DB index:
        // maxmemory-policy is server-wide, so the cache's volatile-lru would apply
        // to job data too.
        const config = configService.getOrThrow<RedisQueueConfig>('redisQueue');
        const client = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          // BullMQ manages its own key namespace, so it must not be prefixed.
          enableReadyCheck: true,
          connectTimeout: 10_000,
          // Required by BullMQ: its blocking reads must not be aborted by a retry cap.
          maxRetriesPerRequest: null,
          retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
        });

        const logger = new Logger('RedisQueue');
        client.on('error', (error) => logger.error(`Queue Redis error: ${error.message}`));
        client.on('connect', () => logger.log(`Connected to ${config.host}:${config.port}`));

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT, REDIS_QUEUE_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Closing Redis connections');
  }
}
