import './tracing'; // must be first — see tracing.ts's own doc comment
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Worker bootstrap.
 *
 * The **same** `AppModule` as the API, started without an HTTP listener. Identical
 * DI graph, identical domain services, identical repositories — the only difference
 * is that no controllers are reachable and the outbox relay actually polls.
 *
 * Sharing the module is the point. If the worker had its own module tree, order
 * cancellation triggered from the dashboard and order cancellation triggered by a
 * timeout job would run through two separately-wired copies of the same logic, and
 * they would drift. Business rules living in one place, exercised by both
 * entrypoints, is what keeps them consistent.
 *
 * Scaling them separately matters operationally: a 50k-row product import should be
 * able to consume worker CPU without adding latency to checkout.
 */
async function bootstrapWorker(): Promise<void> {
  // Read by the queue processors: the API registers the same modules but must not consume
  // jobs, or N API replicas would race each other through the same tenant's saga.
  process.env.EMS_ROLE = 'worker';

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  // `bufferLogs: true` holds every startup message until something flushes them. The HTTP
  // bootstrap flushes implicitly on `listen()`; an application context never does, so
  // without this the worker starts silently and a failed queue connection is invisible.
  app.flushLogs();

  const logger = new Logger('Worker');

  // Ensures OnApplicationShutdown fires — the outbox relay uses it to finish its
  // in-flight batch instead of leaving rows stuck in DISPATCHING, and the log buffer
  // uses it for a final flush.
  app.enableShutdownHooks();

  logger.log('Worker started — outbox relay and queue processors active');

  // An unhandled rejection in a processor must not leave a half-dead process that
  // still reports healthy to the orchestrator.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection in worker: ${String(reason)}`);
  });

  await new Promise<void>((resolve) => {
    const shutdown = (signal: string) => {
      logger.log(`Received ${signal}, shutting down…`);
      void app.close().then(resolve);
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  });
}

void bootstrapWorker().catch((error: unknown) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
