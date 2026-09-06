#!/usr/bin/env node
'use strict';

/**
 * Runs pending migrations guarded by a MySQL named lock (`GET_LOCK`).
 *
 * A rolling deploy starts several new pods at once, and Kubernetes gives no
 * ordering guarantee between their `initContainer`s — without a lock, two
 * pods can both see "pending migrations" and both run `migration:run`
 * simultaneously, which is exactly how a migration ends up applied twice or
 * two DDL statements collide mid-transaction. `GET_LOCK` is a session-scoped
 * MySQL advisory lock: the second caller blocks (up to `LOCK_TIMEOUT_SECONDS`)
 * rather than racing, and running migrations twice against an
 * already-migrated schema is a safe no-op (TypeORM checks the `migrations`
 * table), so the second pod through the lock just confirms there is nothing
 * left to do.
 *
 * Deliberately plain JS, not TS: this runs in the production image after
 * `pnpm install --prod` has stripped ts-node/typeorm-ts-node-commonjs, using
 * only `mysql2` (a runtime dependency) directly against the compiled
 * `dist/database/data-source.js`.
 */

const mysql = require('mysql2/promise');
const path = require('node:path');

const LOCK_NAME = 'ems_migrations';
const LOCK_TIMEOUT_SECONDS = 300;

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'ems',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'ems',
  });

  try {
    const [[{ acquired }]] = await connection.query(
      'SELECT GET_LOCK(?, ?) AS acquired',
      [LOCK_NAME, LOCK_TIMEOUT_SECONDS],
    );

    if (acquired !== 1) {
      throw new Error(
        `Could not acquire migration lock '${LOCK_NAME}' within ${LOCK_TIMEOUT_SECONDS}s — another migration is likely stuck`,
      );
    }

    console.log(`Acquired migration lock '${LOCK_NAME}'`);

    try {
      // Loaded here, after the lock is held, and via the compiled datasource
      // so this works from the production image with no dev tooling.
      const { DataSource } = require('typeorm');
      const dataSourcePath = path.resolve(__dirname, '../dist/database/data-source.js');
      const { dataSourceOptions } = require(dataSourcePath);

      const dataSource = new DataSource(dataSourceOptions);
      await dataSource.initialize();

      const applied = await dataSource.runMigrations();
      console.log(`Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ') || '(none pending)'}`);

      await dataSource.destroy();
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
      console.log(`Released migration lock '${LOCK_NAME}'`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
