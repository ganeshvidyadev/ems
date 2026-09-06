import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { MetricsRegistry } from '../../modules/health/metrics.registry';

/**
 * Records the RED metrics (`http_requests_total`, `http_request_duration_seconds`)
 * every route in `infra/grafana/dashboards/api-red.json` and the canary gate
 * (`scripts/canary-rollout.mjs`) read.
 *
 * Registered outermost in `app.module.ts`'s `APP_INTERCEPTOR` list, so its
 * timer spans every other interceptor's work. It hooks `response.on('finish')`
 * rather than `next.handle()`'s own completion: a thrown exception propagates
 * as an *error* through the interceptor chain and is handled by
 * `GlobalExceptionFilter` outside of it, so `next.handle()` completing is not
 * a reliable "the response is done" signal on the error path — the response
 * object's own `finish` event, fired once Express has actually written the
 * final status code and flushed the body, is.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    response.on('finish', () => {
      // Express attaches the matched route's own path template here (e.g.
      // `/api/v1/console/orders/:id`), never the raw URL — labeling on the
      // raw URL would give every distinct order id its own time series and
      // make this cardinality-unbounded.
      const route = (request.route?.path as string | undefined) ?? request.path ?? 'unknown';
      const labels = {
        method: request.method,
        route,
        status_code: String(response.statusCode),
      };

      this.metrics.httpRequestsTotal.inc(labels);
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    });

    return next.handle();
  }
}
