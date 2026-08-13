import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Integration-suite bootstrap.
 *
 * Points every test at the `ems_test` database created by
 * `infra/docker/mysql/init/01-init.sql`. A separate database — not a separate
 * schema or a transaction-rollback trick — so a suite can `TRUNCATE` freely
 * without any chance of wiping a developer's dev data.
 */
loadDotenv({ path: resolve(__dirname, '../../../../.env') });

process.env.NODE_ENV = 'test';
process.env.MYSQL_DATABASE = 'ems_test';

// Logging off: the suite would otherwise fill the log store with test traffic and
// slow every case by the cost of a Mongo write.
process.env.MONGO_LOGGING_ENABLED = 'false';

// The relay polls on a timer; letting it run would make tests race against it.
// Tests that exercise the relay start it explicitly.
process.env.OUTBOX_RELAY_ENABLED = 'false';

// Container start-up dominates the first test's runtime.
jest.setTimeout(120_000);
