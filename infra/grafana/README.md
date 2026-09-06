# Grafana / Prometheus

`dashboards/api-red.json` — import via Grafana's dashboard JSON import, pointed
at a Prometheus datasource scraping `ems-api`'s `/metrics` (see the
`prometheus.io/scrape` annotations on `infra/k8s/api-deployment.yaml`).

Panels sourced directly from `/metrics` (verified against the running app —
see the Phase 12 session notes): request rate, error rate, duration
percentiles, `ems_outbox_lag_seconds`, `ems_log_buffer_dropped_total`.

Panels that need an additional exporter, not yet deployed in this
environment:

- **Queue depths** — a [bullmq-exporter](https://github.com/dubzzz/bullmq-prometheus-exporter)
  sidecar (or a small wrapper around `QueueRegistry.depths()`) exposing
  `bullmq_queue_waiting_count`.
- **Cache hit ratio** — the standard `redis_exporter` sidecar against the
  cache Redis instance, exposing `redis_keyspace_hits_total`/`_misses_total`.
- **Certificate expiry** — a `blackbox_exporter` TLS probe against every
  verified tenant domain (the probe target list comes from
  `tenant_domains.status = 'VERIFIED'`), exposing `probe_ssl_earliest_cert_expiry`.

`alerts/api.rules.yml` — Prometheus alerting rules; load via `rule_files` in
`prometheus.yml` or, on Kubernetes, a `PrometheusRule` CRD if using the
Prometheus Operator.
