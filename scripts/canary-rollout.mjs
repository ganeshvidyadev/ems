#!/usr/bin/env node
/**
 * Watches the RED metrics Grafana already scrapes (see
 * `infra/grafana/dashboards/api-red.json`) for a fixed window after a
 * canary deploy, and either exits 0 (promote) or non-zero (the CI job
 * fails, which — per `docs/runbooks/canary-rollback.md` — is the signal to
 * run `kubectl rollout undo`).
 *
 * Queries Prometheus directly (the same server Grafana's own datasource
 * points at) rather than parsing Grafana's dashboard JSON, so this has one
 * fewer moving part to keep in sync with dashboard edits.
 *
 * Needs a real Prometheus URL and a cluster actually emitting the
 * `http_requests_total`/`http_request_duration_seconds` series `/metrics`
 * exports — unexercisable without one, same as the CI job it's wired into.
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    namespace: { type: 'string', default: 'ems' },
    deployment: { type: 'string', default: 'ems-api' },
    'error-rate-threshold': { type: 'string', default: '0.02' },
    'window-seconds': { type: 'string', default: '300' },
  },
});

const prometheusUrl = process.env.PROMETHEUS_URL;
const errorRateThreshold = Number(values['error-rate-threshold']);
const windowSeconds = Number(values['window-seconds']);

if (!prometheusUrl) {
  console.error('PROMETHEUS_URL is not set — cannot evaluate the canary window');
  process.exit(1);
}

async function queryPrometheus(query) {
  const url = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Prometheus query failed: ${res.status}`);
  const body = await res.json();
  return Number(body?.data?.result?.[0]?.value?.[1] ?? 0);
}

async function main() {
  console.log(
    `Watching ${values.deployment} in ${values.namespace} for ${windowSeconds}s (error-rate threshold ${errorRateThreshold})...`,
  );

  await new Promise((resolve) => setTimeout(resolve, windowSeconds * 1000));

  const errorRate = await queryPrometheus(
    `sum(rate(http_requests_total{job="${values.deployment}",status_code=~"5.."}[${windowSeconds}s])) / sum(rate(http_requests_total{job="${values.deployment}"}[${windowSeconds}s]))`,
  );
  const p95LatencySeconds = await queryPrometheus(
    `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="${values.deployment}"}[${windowSeconds}s])) by (le))`,
  );

  console.log(`Observed error rate: ${(errorRate * 100).toFixed(2)}%`);
  console.log(`Observed p95 latency: ${(p95LatencySeconds * 1000).toFixed(0)}ms`);

  if (Number.isNaN(errorRate) || errorRate > errorRateThreshold) {
    console.error(`Error rate ${errorRate} exceeds threshold ${errorRateThreshold} — failing the canary`);
    process.exit(1);
  }

  console.log('Canary window clean — safe to promote to 100%');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
