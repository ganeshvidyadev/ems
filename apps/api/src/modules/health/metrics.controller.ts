import { Controller, Get, Header, Optional, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Gauge } from 'prom-client';
import { Public } from '../../common/decorators';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { LogBufferService } from '../logging/log-buffer.service';
import { MetricsRegistry } from './metrics.registry';
import { OutboxRelayService } from '../../queues/outbox-relay.service';

/**
 * Prometheus scrape endpoint.
 *
 * Gauges are collected lazily, at scrape time, rather than pushed on a timer. That
 * way an unscraped instance does no work, and the value reported is the value at
 * the moment of the scrape rather than up to an interval stale.
 *
 * The metrics that matter most here are the ones that reveal *silent* failure:
 * `ems_log_buffer_dropped_total` (logs being discarded under pressure) and
 * `ems_outbox_lag_seconds` (committed state drifting from its downstream effects).
 * Both are invisible in request-level monitoring.
 */
// Unversioned for the same reason as /health: the Prometheus scrape config should
// not need editing when the product API version changes.
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
@ApiExcludeController()
export class MetricsController {
  private readonly registry = this.metrics.registry;

  constructor(
    private readonly metrics: MetricsRegistry,
    @Optional() private readonly logBuffer?: LogBufferService,
    @Optional() private readonly outboxRelay?: OutboxRelayService,
  ) {
    // Each gauge carries its own collect callback so a scrape reads live values.
    this.gauge('ems_log_buffer_depth', 'Documents waiting to be written to MongoDB', () =>
      this.logBuffer ? this.logBuffer.stats.buffered : 0,
    );
    this.gauge(
      'ems_log_buffer_dropped_total',
      'Log documents dropped because the buffer was full — non-zero means observability loss',
      () => (this.logBuffer ? this.logBuffer.stats.dropped : 0),
    );
    this.gauge('ems_log_buffer_written_total', 'Log documents written to MongoDB', () =>
      this.logBuffer ? this.logBuffer.stats.written : 0,
    );
    this.gauge(
      'ems_log_buffer_failed_flushes_total',
      'Failed MongoDB flush batches',
      () => (this.logBuffer ? this.logBuffer.stats.failedFlushes : 0),
    );

    // The single most important health signal in the system (see
    // `OutboxRelayService.getLagSeconds`'s own doc comment): rising lag means
    // committed state and its downstream effects are drifting apart — orders
    // placed but stock not decremented, payments captured but no
    // confirmation sent. Async collect — the underlying query is a real
    // `SELECT MIN(created_at)`, not an in-memory counter.
    this.gauge('ems_outbox_lag_seconds', 'Age of the oldest undispatched outbox event', () =>
      this.outboxRelay ? this.outboxRelay.getLagSeconds() : Promise.resolve(0),
    );
  }

  private gauge(name: string, help: string, read: () => number | Promise<number>): void {
    // Guard against double registration when the module is instantiated twice
    // (happens in tests that build the app more than once).
    if (this.registry.getSingleMetric(name)) return;

    const gauge = new Gauge({
      name,
      help,
      registers: [this.registry],
      async collect() {
        gauge.set(await read());
      },
    });
  }

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<RawResponse<string>> {
    // RawResponse: Prometheus expects the exposition text format, and wrapping it
    // in the JSON envelope would make it unparseable.
    return new RawResponse(await this.registry.metrics());
  }
}
