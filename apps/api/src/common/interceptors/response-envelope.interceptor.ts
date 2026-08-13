import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { PaginationMeta, ResponseMeta } from '@ems/contracts';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { RequestContextService } from '../services/request-context.service';

/** Handlers return this when they need to attach pagination to the envelope. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly pagination: PaginationMeta,
  ) {}
}

/** Marker for responses that must not be wrapped (file downloads, metrics text). */
export const RAW_RESPONSE = Symbol('raw-response');
export class RawResponse<T> {
  readonly [RAW_RESPONSE] = true;
  constructor(readonly payload: T) {}
}

/**
 * Wraps every successful response in the envelope from docs/04 §2.
 *
 * Controllers return plain data — a DTO, an array, a `Paginated` — and never build
 * the envelope themselves. Hand-assembling it at 300 handlers guarantees some of
 * them will differ, and a client that meets two shapes stops trusting either.
 *
 * 204 responses pass through untouched: a body on a No Content response is a
 * protocol violation that some proxies will strip and others will forward.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(private readonly context: RequestContextService) {}

  intercept(executionContext: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const http = executionContext.switchToHttp();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (response.statusCode === 204 || data === undefined) return data;
        if (data instanceof RawResponse) return data.payload;

        const meta: ResponseMeta = {
          correlationId: this.context.correlationId ?? 'unknown',
          timestamp: new Date().toISOString(),
          durationMs: this.context.elapsedMs,
        };

        if (data instanceof Paginated) {
          return {
            success: true as const,
            data: data.items,
            meta: { ...meta, pagination: data.pagination },
          };
        }

        return { success: true as const, data, meta };
      }),
    );
  }
}
