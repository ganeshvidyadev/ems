import { Injectable, type NestMiddleware } from '@nestjs/common';
import { newPublicId, isPublicId } from '@ems/kernel';
import type { NextFunction, Request, Response } from 'express';
import {
  RequestContextService,
  type RequestContext,
} from '../services/request-context.service';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Opens the `AsyncLocalStorage` store for the request and establishes the
 * correlation id.
 *
 * Registered first, before every other middleware and guard, so that anything
 * which throws later still has a correlation id to report. An error response
 * without one is the response a merchant screenshots and we cannot trace.
 *
 * An inbound `X-Correlation-Id` is honoured so a trace started in the console or
 * storefront continues into the API — but only if it is a well-formed ULID.
 * Echoing arbitrary client input into every log line and response header is a log
 * injection vector.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly contextService: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[CORRELATION_ID_HEADER];
    const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
    const correlationId = candidate && isPublicId(candidate) ? candidate : newPublicId();

    const context: RequestContext = {
      correlationId,
      tenantId: null,
      surface: detectSurface(req.originalUrl ?? req.url),
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      startedAt: Date.now(),
    };

    // Set before the handler runs so a client can correlate even a 500.
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    // Also hung off the request object: Express error handlers and third-party
    // middleware run outside our ALS store and would otherwise have no access.
    (req as Request & { correlationId?: string }).correlationId = correlationId;

    this.contextService.run(context, () => next());
  }
}

/**
 * Route tree → surface. Determines which tenant-resolution strategy applies
 * (docs/01 §4.1) and which CSP/CORS policy the response gets.
 */
function detectSurface(url: string): RequestContext['surface'] {
  if (url.includes('/platform/')) return 'platform';
  if (url.includes('/storefront/')) return 'storefront';
  if (url.includes('/webhooks/')) return 'webhook';
  if (url.includes('/console/')) return 'console';
  return 'console';
}

/**
 * Client IP behind a proxy.
 *
 * Reads the **left-most** entry of `X-Forwarded-For`, which is the original
 * client; entries to the right are the proxy chain. Note this is only trustworthy
 * because Express `trust proxy` is configured in `main.ts` — otherwise a client
 * can forge the header and defeat per-IP rate limiting.
 */
function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!.split(',')[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? null;
}
