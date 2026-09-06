/**
 * OpenTelemetry bootstrap — imported as the very first line of `main.ts`/
 * `worker.ts`, before `reflect-metadata` or anything else.
 *
 * Auto-instrumentation works by monkey-patching a module's exports the
 * moment it's `require`'d, so the SDK has to start before anything else
 * pulls in `http`, `mysql2`, `ioredis`, `mongodb`, or `bullmq` — importing it
 * later would silently instrument nothing, which is a failure mode with no
 * error message, just empty traces.
 *
 * Reads `process.env` directly rather than the validated `AppConfig`: this
 * file executes before Nest's `ConfigModule` (or anything else) exists.
 *
 * A no-op — not even the SDK constructed — when `OTEL_ENABLED` isn't
 * `'true'`, so a local `pnpm dev` with no collector configured pays zero
 * cost for this file existing.
 */
if (process.env.OTEL_ENABLED === 'true' || process.env.OTEL_ENABLED === '1') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.EMS_ROLE === 'worker' ? 'ems-worker' : 'ems-api',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
        : undefined,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Fires on every static asset Swagger/health serves — pure noise in
        // a trace backend that's meant to answer "why was this checkout slow".
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // BullMQ crosses a queue boundary that plain HTTP/DB auto-instrumentation
  // cannot see across — a trace for "the job a checkout enqueued" needs its
  // own span linkage, which is the "OpenTelemetry tracing across BullMQ
  // boundaries" the roadmap calls out by name. `RequestContextService`
  // already carries `correlationId`/`causationId` through every queue job
  // (see `provisioning.processor.ts`'s own doc comment on why); the
  // OTel-specific piece — reading the active trace context and attaching it
  // to `OutboxService.emit`'s payload, then starting a linked span in each
  // processor's `context.run` — is genuine work, not wired by
  // `getNodeAutoInstrumentations` out of the box, and is the natural next
  // increment once a real collector exists to send these traces to.

  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}
