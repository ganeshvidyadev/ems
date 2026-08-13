import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { join, resolve } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities';

// The monorepo keeps one .env at the root so docker-compose and every app read
// the same values. Resolved from __dirname rather than cwd so the TypeORM CLI
// works regardless of which directory it is invoked from.
loadDotenv({ path: resolve(__dirname, '../../../../.env') });

const isCompiled = __filename.endsWith('.js');

export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  username: process.env.MYSQL_USER ?? 'ems',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'ems',

  // NEVER true — in any environment, including local. One accidental
  // `synchronize: true` against a shared database silently drops columns it
  // does not recognise. Schema changes go through migrations, without exception.
  synchronize: false,
  migrationsRun: false,

  entities: ALL_ENTITIES,
  migrations: [join(__dirname, isCompiled ? 'migrations/*.js' : 'migrations/*.ts')],
  migrationsTableName: 'migrations',

  logging: process.env.MYSQL_LOGGING === 'true' ? ['query', 'error', 'warn'] : ['error', 'warn'],

  charset: 'utf8mb4_0900_ai_ci',
  timezone: 'Z', // Store and read UTC; never let the driver shift datetimes.

  extra: {
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 20),
    // Fail fast on a dead database rather than letting requests pile up behind
    // a connect that will never complete.
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // BIGINT exceeds Number.MAX_SAFE_INTEGER, so the driver must hand it back as
    // a string. Letting it become a float would corrupt ids and money columns.
    supportBigNumbers: true,
    bigNumberStrings: true,
    // DECIMAL as string for the same reason — tax rates must not round-trip
    // through a float.
    decimalNumbers: false,
    timezone: 'Z',
  },
};

/**
 * CLI datasource. Referenced by `pnpm run typeorm -d src/database/data-source.ts`
 * and therefore by every migration command.
 */
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
