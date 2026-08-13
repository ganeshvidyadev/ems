import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { MongoConfig } from '../../config/configuration';
import { LogBufferService } from './log-buffer.service';

/**
 * MongoDB logging.
 *
 * Global because the logging interceptor is registered app-wide and would
 * otherwise need this imported into every feature module.
 *
 * No Mongoose models are defined: log documents are written through the raw driver
 * (`connection.collection(...).insertMany`) in `LogBufferService`. Schema validation
 * and Mongoose middleware would add per-document overhead to the highest-volume
 * write path in the system, for data that is append-only, never read by the
 * application, and disposable by design.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<MongoConfig>('mongo');
        return {
          uri: config.uri,
          dbName: config.database,
          // Small pool: writes are batched, so a large pool would sit idle while
          // still holding connections the primary store may need.
          maxPoolSize: 10,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 5_000,
          socketTimeoutMS: 20_000,
          // Never block the app waiting for Mongo. Logging is not on the critical
          // path and must not be able to make it look like one.
          bufferCommands: false,
          autoIndex: false,
        };
      },
    }),
  ],
  providers: [LogBufferService],
  exports: [LogBufferService],
})
export class LoggingModule {}
