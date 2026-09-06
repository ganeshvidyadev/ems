import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * The one Prometheus `Registry` for the whole process, shared by
 * `MetricsController` (which scrapes it) and `HttpMetricsInterceptor` (which
 * feeds it) — a registry per-consumer would either double-register the
 * default process metrics or silently split the RED series across two
 * registries that `/metrics` never actually merges.
 */
@Injectable()
export class MetricsRegistry {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  readonly httpRequestDurationSeconds: Histogram<'method' | 'route' | 'status_code'>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'ems-api' });
    collectDefaultMetrics({ register: this.registry });

    // RED: Rate (this counter), Errors (filter this counter on status_code=~"5.."),
    // Duration (the histogram below) — the exact three signals the Phase 12
    // Grafana dashboard (`infra/grafana/dashboards/api-red.json`) and the
    // canary gate (`scripts/canary-rollout.mjs`) both read.
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests, by method/route/status',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds, by method/route/status',
      labelNames: ['method', 'route', 'status_code'],
      // A checkout write and a health probe live on very different scales;
      // buckets span both without either one collapsing into a single bucket.
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }
}
