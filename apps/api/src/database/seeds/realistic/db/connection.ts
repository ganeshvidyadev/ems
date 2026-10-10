import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as mysql from 'mysql2/promise';

/**
 * Connection and target-safety layer.
 *
 * The seeder talks to MySQL through mysql2 directly rather than through the application's TypeORM
 * DataSource: it never needs entity metadata, it must not trigger the tenant-guard subscriber, and
 * a plain pool keeps the process small on a memory-starved machine.
 */

export interface Target {
  host: string;
  port: number;
  database: string;
  nodeEnv: string;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const KNOWN_DEV_DATABASES = new Set(['ems', 'ems_test']);

/** Loads the monorepo's root .env (the same file the application reads). Never prints values. */
export function loadEnv(): void {
  const candidates = [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env'), resolve(__dirname, '../../../../../../../.env')];
  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path });
      return;
    }
  }
}

export function resolveTarget(): Target {
  return {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE ?? 'ems',
    nodeEnv: process.env.NODE_ENV ?? '(unset)',
  };
}

/** Returns the reasons this target must not be seeded (empty = allowed). */
export function targetProblems(target: Target, allowDatabases: string[]): string[] {
  const problems: string[] = [];
  if (target.nodeEnv === 'production') problems.push('NODE_ENV is "production"');
  if (!LOCAL_HOSTS.has(target.host)) problems.push(`MYSQL_HOST "${target.host}" is not a local host (127.0.0.1 / localhost)`);
  if (!KNOWN_DEV_DATABASES.has(target.database) && !allowDatabases.includes(target.database)) {
    problems.push(`database "${target.database}" is not a known dev/test database (ems, ems_test) and was not named with --allow-db`);
  }
  return problems;
}

export function describeTarget(target: Target): string {
  return `host=${target.host} port=${target.port} database=${target.database} NODE_ENV=${target.nodeEnv}`;
}

export function createPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'ems',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'ems',
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    connectionLimit: 3,
    connectTimeout: 10_000,
    multipleStatements: false,
  });
}

export type Conn = mysql.PoolConnection;

/** Runs `fn` on a connection whose session is READ ONLY: the database itself refuses any write. */
export async function withReadOnly<T>(pool: mysql.Pool, fn: (conn: Conn) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET SESSION TRANSACTION READ ONLY');
    await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION READ ONLY');
    try {
      return await fn(conn);
    } finally {
      await conn.query('ROLLBACK');
    }
  } finally {
    conn.release();
  }
}

export async function q<T = Record<string, unknown>>(conn: Conn, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await conn.query(sql, params);
  return rows as T[];
}
