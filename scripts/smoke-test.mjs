#!/usr/bin/env node
/**
 * Post-deploy smoke test — the CI/CD gate between "staging deployed" and
 * "promote to canary" (docs/05 Phase 12's own pipeline order). Deliberately
 * a real login round-trip, not just a health-check ping: `/health/ready`
 * only proves the process is up and its own dependencies answer, not that
 * auth, the database, and the response envelope all actually work together
 * for a real request — the same gap a health check alone always has.
 *
 * Exits non-zero (failing the pipeline) on any check failure.
 */
const baseUrl = process.env.STAGING_URL;
const email = process.env.SMOKE_TEST_EMAIL;
const password = process.env.SMOKE_TEST_PASSWORD;

if (!baseUrl) {
  console.error('STAGING_URL is not set — cannot run smoke tests');
  process.exit(1);
}

async function check(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('OK');
  } catch (error) {
    console.log('FAILED');
    console.error(`    ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log(`Smoke testing ${baseUrl}`);

  // No `/api/v1` prefix on health routes — `main.ts`'s `setGlobalPrefix`
  // excludes them; every other route below is under `/api/v1`.
  await check('liveness', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  });

  await check('readiness', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  });

  if (email && password) {
    let accessToken;

    await check('login round-trip', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body?.success || !body?.data?.accessToken) {
        throw new Error('response envelope did not carry an accessToken');
      }
      accessToken = body.data.accessToken;
    });

    await check('authenticated request round-trip', async () => {
      const res = await fetch(`${baseUrl}/api/v1/console/notifications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    });
  } else {
    console.log('  (SMOKE_TEST_EMAIL/PASSWORD not set — skipping the authenticated round-trip)');
  }

  if (process.exitCode) {
    console.error('\nSmoke test FAILED');
  } else {
    console.log('\nSmoke test passed');
  }
}

main();
