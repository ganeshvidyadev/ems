import { execFileSync } from 'node:child_process';

// Read-mostly MySQL helper for black-box DB assertions. Uses the documented local-only
// dev credentials from .env.example; override via QA_MYSQL_* env vars. Never logs the password.
const MYSQL = process.env.QA_MYSQL_BIN ?? 'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe';

export function sql(query, db = process.env.QA_MYSQL_DB ?? 'ems') {
  const out = execFileSync(
    MYSQL,
    [
      '--host=127.0.0.1',
      `--port=${process.env.QA_MYSQL_PORT ?? '3307'}`,
      `--user=${process.env.QA_MYSQL_USER ?? 'ems'}`,
      '--batch',
      '--raw',
      '--skip-column-names',
      db,
      '-e',
      query,
    ],
    { env: { ...process.env, MYSQL_PWD: process.env.QA_MYSQL_PASSWORD ?? 'emspassword' }, encoding: 'utf8', timeout: 20_000 },
  );
  return out.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
}
