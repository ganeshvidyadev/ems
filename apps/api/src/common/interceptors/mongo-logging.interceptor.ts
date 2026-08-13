import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { catchError, tap, throwError, type Observable } from 'rxjs';
import { UAParser } from 'ua-parser-js';
import { LogBufferService } from '../../modules/logging/log-buffer.service';
import { RequestContextService } from '../services/request-context.service';
import { redact, redactHeaders, truncateForLog } from '../utils/redact';
import type { LoggingConfig } from '../../config/configuration';

/**
 * Records every request/response pair into MongoDB.
 *
 * The critical property: **the client's response is never delayed by logging.**
 * Documents are handed to a bounded in-memory buffer inside `setImmediate`, so the
 * work happens after the response has been written and never inside the request's
 * critical path (docs/01 §9).
 *
 * Sampling is asymmetric on purpose. Errors and mutations are logged at 100 %
 * because they are what incidents are made of; successful GETs are sampled,
 * because on a busy storefront they are the overwhelming majority of traffic and
 * their diagnostic value decays within hours. Logging all of them buys storage
 * cost and slower queries over the documents that matter.
 */
@Injectable()
export class MongoLoggingInterceptor implements NestInterceptor {
  private readonly config: LoggingConfig;
  private readonly uaParser = new UAParser();

  constructor(
    private readonly buffer: LogBufferService,
    private readonly context: RequestContextService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<LoggingConfig>('logging');
  }

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.enabled || executionContext.getType() !== 'http') {
      return next.handle();
    }

    const http = executionContext.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    // Captured now: a handler may reassign req.body, and the route pattern is only
    // reliably available while the handler context is live.
    const snapshot = this.captureRequest(request, executionContext);

    return next.handle().pipe(
      tap((body) => {
        this.schedule(snapshot, response.statusCode, body, null, startedAt);
      }),
      catchError((error: unknown) => {
        const status =
          typeof (error as { status?: number })?.status === 'number'
            ? (error as { status: number }).status
            : 500;
        this.schedule(snapshot, status, null, error, startedAt);
        return throwError(() => error);
      }),
    );
  }

  private captureRequest(request: Request, executionContext: ExecutionContext) {
    const handler = executionContext.getHandler();
    const controller = executionContext.getClass();

    return {
      method: request.method,
      url: request.originalUrl ?? request.url,
      // The route *pattern* (`/products/:id`), not the resolved path. Grouping by
      // resolved path would produce one bucket per product id, making
      // "which endpoint is slow?" unanswerable.
      route: (request.route as { path?: string } | undefined)?.path ?? request.path,
      handler: `${controller.name}.${handler.name}`,
      query: redact(request.query),
      params: redact(request.params),
      headers: redactHeaders(request.headers as Record<string, unknown>),
      body: request.body,
      userAgent: request.headers['user-agent'] ?? null,
    };
  }

  private schedule(
    snapshot: ReturnType<MongoLoggingInterceptor['captureRequest']>,
    statusCode: number,
    responseBody: unknown,
    error: unknown,
    startedAt: number,
  ): void {
    const isError = statusCode >= 400 || error !== null;
    const isMutation = snapshot.method !== 'GET' && snapshot.method !== 'HEAD';

    if (!isError && !isMutation && Math.random() > this.config.successGetSampleRate) {
      return;
    }

    // Snapshot the context now: by the time setImmediate runs, the ALS store for
    // this request may no longer be the active one.
    const ctx = this.context.get();
    const durationMs = Date.now() - startedAt;

    setImmediate(() => {
      try {
        const requestBody = truncateForLog(redact(snapshot.body));
        const responsePayload = truncateForLog(redact(responseBody));
        const client = this.parseClient(snapshot.userAgent, ctx?.ip ?? null);

        this.buffer.enqueue('api_logs', {
          correlationId: ctx?.correlationId ?? null,
          tenantId: ctx?.tenantId ? Number(ctx.tenantId) : null,
          userId: ctx?.userId ? Number(ctx.userId) : null,
          userType: ctx?.userType ?? null,
          surface: ctx?.surface ?? 'console',
          request: {
            method: snapshot.method,
            url: snapshot.url,
            route: snapshot.route,
            handler: snapshot.handler,
            query: snapshot.query,
            params: snapshot.params,
            headers: snapshot.headers,
            body: requestBody.value,
            bodySize: requestBody.size,
          },
          response: {
            statusCode,
            body: isError ? responsePayload.value : undefined,
            size: responsePayload.size,
          },
          timing: { startedAt: new Date(startedAt), durationMs },
          client,
          error: error ? this.describeError(error) : null,
          createdAt: new Date(),
        });

        // Errors additionally land in error_logs, which has a 90-day TTL and a
        // fingerprint index — so one recurring bug is one row in the admin UI
        // rather than 40 000.
        if (error) {
          this.buffer.enqueue('error_logs', {
            correlationId: ctx?.correlationId ?? null,
            tenantId: ctx?.tenantId ? Number(ctx.tenantId) : null,
            level: statusCode >= 500 ? 'error' : 'warn',
            ...this.describeError(error),
            fingerprint: this.fingerprint(error),
            context: {
              route: snapshot.route,
              method: snapshot.method,
              statusCode,
              handler: snapshot.handler,
            },
            createdAt: new Date(),
          });
        }
      } catch {
        // A logging bug must never surface to the client or crash the process.
        // There is nowhere useful left to report this, so it is swallowed.
      }
    });
  }

  private parseClient(userAgent: string | null | undefined, ip: string | null) {
    if (!userAgent) return { ip, isBot: false };

    this.uaParser.setUA(userAgent);
    const result = this.uaParser.getResult();

    return {
      ip,
      browser: result.browser.name ?? null,
      browserVersion: result.browser.version ?? null,
      os: result.os.name ?? null,
      osVersion: result.os.version ?? null,
      device: result.device.type ?? 'desktop',
      isBot: /bot|crawler|spider|crawling|headless/i.test(userAgent),
    };
  }

  private describeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        // Stack is capped: a deep async stack can run to tens of kilobytes and
        // the useful part is always at the top.
        stack: error.stack?.split('\n').slice(0, 30).join('\n') ?? null,
        code: (error as { code?: string }).code ?? null,
      };
    }
    return { name: 'UnknownError', message: String(error), stack: null, code: null };
  }

  /**
   * Groups recurring instances of the same fault.
   *
   * Hashes the error name plus a *normalised* message — digits and quoted values
   * replaced — plus the top three stack frames. Without normalisation, "Product
   * 4471 not found" and "Product 4472 not found" would be two different groups,
   * and grouping would be useless exactly where it is most needed.
   */
  private fingerprint(error: unknown): string {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = rawMessage
      .replace(/\d+/g, 'N')
      .replace(/'[^']*'/g, "'X'")
      .replace(/"[^"]*"/g, '"X"')
      .slice(0, 200);

    const frames =
      error instanceof Error && error.stack
        ? error.stack
            .split('\n')
            .slice(1, 4)
            .map((line) => line.trim().replace(/:\d+:\d+/g, ''))
            .join('|')
        : '';

    // FNV-1a — fast, dependency-free, and collision resistance is irrelevant for
    // a log grouping key.
    let hash = 0x811c9dc5;
    const input = `${name}::${message}::${frames}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}
