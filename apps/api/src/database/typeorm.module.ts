import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { AppConfig, DatabaseConfig } from '../config/configuration';
import { ALL_ENTITIES } from './entities';
import { RequestContextService } from '../common/services/request-context.service';
import { TenantGuardSubscriber } from './subscribers/tenant-guard.subscriber';

/**
 * MySQL connection and the tenant isolation subscriber.
 *
 * The subscriber is registered here — as a provider that pushes itself onto
 * `dataSource.subscribers` — rather than via the `subscribers` option, because it
 * needs `RequestContextService` injected. TypeORM instantiates option-declared
 * subscribers itself, with no access to the Nest container, so it would have no way
 * to read the request context and could not enforce anything.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const db = configService.getOrThrow<DatabaseConfig>('database');
        const app = configService.getOrThrow<AppConfig>('app');

        return {
          type: 'mysql' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities: ALL_ENTITIES,

          /**
           * Migrations must be declared here even though they are never auto-run.
           *
           * `DataSource.showMigrations()` and `runMigrations()` both read this list. Omitting
           * it made `showMigrations()` always return false, so `/health/startup` reported
           * "up-to-date" against *any* schema — including one missing every table. A probe
           * that cannot fail is worse than no probe, because it is trusted.
           */
          migrations: [
            join(__dirname, __filename.endsWith('.js') ? 'migrations/*.js' : 'migrations/*.ts'),
          ],
          migrationsTableName: 'migrations',

          // Not negotiable, in any environment. A stray `synchronize: true`
          // against a shared database drops columns it does not recognise.
          synchronize: false,
          // Migrations run as an explicit step (a Kubernetes initContainer with an
          // advisory lock), never on boot — N replicas rolling out simultaneously
          // would otherwise race each other through the same DDL.
          migrationsRun: false,

          logging: db.logging ? (['query', 'error', 'warn'] as const) : (['error'] as const),
          charset: 'utf8mb4_0900_ai_ci',
          timezone: 'Z',
          // Retry on boot: in Compose or Kubernetes the API frequently starts
          // before MySQL is accepting connections.
          retryAttempts: app.isProduction ? 10 : 3,
          retryDelay: 3_000,
          autoLoadEntities: false,

          extra: {
            connectionLimit: db.poolSize,
            connectTimeout: 10_000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10_000,
            // BIGINT and DECIMAL as strings — see data-source.ts. Losing precision
            // on an id or a money column is silent and unrecoverable.
            supportBigNumbers: true,
            bigNumberStrings: true,
            decimalNumbers: false,
            timezone: 'Z',
          },
        };
      },
    }),
  ],
  providers: [
    {
      provide: TenantGuardSubscriber,
      inject: [DataSource, RequestContextService],
      useFactory: (dataSource: DataSource, context: RequestContextService) =>
        new TenantGuardSubscriber(dataSource, context),
    },
  ],
  exports: [TenantGuardSubscriber],
})
export class DatabaseModule {}
