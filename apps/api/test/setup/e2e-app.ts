import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

// Loaded and mutated BEFORE any application module is imported, because
// `configuration()` memoizes on first call and reads process.env at that moment.
loadDotenv({ path: resolve(__dirname, '../../../../.env') });

process.env.NODE_ENV = 'test';
// A separate database, created by infra/docker/mysql/init/01-init.sql. Not a
// transaction-rollback trick: these tests exercise real commits, the outbox, and
// multi-statement flows, so they need a database they are allowed to truncate.
process.env.MYSQL_DATABASE = 'ems_test';
// The relay polls on a timer; leaving it on would race the assertions.
process.env.OUTBOX_RELAY_ENABLED = 'false';
process.env.MONGO_LOGGING_ENABLED = 'false';
// Separate Redis namespace so a test run cannot evict dev sessions or read dev OTPs.
process.env.REDIS_KEY_PREFIX = 'test';

/* eslint-disable import/first */
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { seedPermissions } from '../../src/database/seeds/permissions.seed';
import { seedRoles } from '../../src/database/seeds/roles.seed';
/* eslint-enable import/first */

export interface E2EContext {
  app: INestApplication;
  dataSource: DataSource;
  baseUrl: string;
}

let cached: E2EContext | null = null;

/**
 * Boots the real application against `ems_test`.
 *
 * The full module graph, real MySQL, real Redis — not mocks. Auth is exactly the kind of
 * code where mocks hide the bugs that matter: the lockout off-by-one came from MySQL's
 * left-to-right `SET` evaluation, and the boolean-transformer defect came from how the
 * driver binds `undefined`. Neither is reproducible against a fake.
 *
 * Middleware and versioning are configured to mirror `main.ts`, because the tenant
 * context is opened by middleware and the routes are version-prefixed — a test app
 * missing either would exercise a different application than production runs.
 */
export async function bootstrapE2E(): Promise<E2EContext> {
  if (cached) return cached;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  app.use(cookieParser());
  app.setGlobalPrefix('api', {
    exclude: ['health/live', 'health/ready', 'health/startup', 'metrics', '.well-known/jwks.json'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.init();

  const dataSource = app.get(DataSource);

  // Schema and reference data. Migrations are idempotent; seeds converge.
  await dataSource.runMigrations();
  await seedPermissions(dataSource);
  await seedRoles(dataSource);

  cached = { app, dataSource, baseUrl: '/api/v1' };
  return cached;
}

export async function teardownE2E(): Promise<void> {
  if (!cached) return;
  await cached.app.close();
  cached = null;
}

/**
 * Removes test-created rows between suites.
 *
 * Ordered by FK dependency and scoped to the fixture prefixes, so a stray row cannot
 * survive into the next suite and make a later assertion pass for the wrong reason.
 * `tenants` is emptied last because everything references it.
 */
export async function resetTestData(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of [
      'refresh_tokens',
      'auth_tokens',
      'user_invitations',
      'user_roles',
      'outbox_events',
      'processed_events',
      'audit_logs',
      'api_keys',
      'job_runs',
      'tenant_domains',
    ]) {
      await dataSource.query(`DELETE FROM \`${table}\``);
    }
    // Owner backlink first, or the users delete trips fk_tenants_owner_user.
    await dataSource.query('UPDATE tenants SET owner_user_id = NULL');
    await dataSource.query('DELETE FROM users');
    await dataSource.query('DELETE FROM tenants');
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
