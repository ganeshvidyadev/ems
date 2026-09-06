import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { CrossTenantAccessError, DomainError } from '@ems/kernel';
import {
  ErrorCode,
  docsUrlForErrorCode,
  statusForErrorCode,
  type ErrorBody,
  type ErrorResponse,
} from '@ems/contracts';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { RequestValidationError, RateLimitExceededError } from '../errors/api.errors';
import type { RequestContextService } from '../services/request-context.service';

interface MysqlDriverError {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  sqlState?: string;
}

/**
 * The single exit point for every unhandled error.
 *
 * Two responsibilities that must not be separated:
 *  1. Produce the envelope from docs/04 §2 — so a client never has to branch on
 *     response *shape* before it can branch on outcome.
 *  2. Make sure nothing internal escapes. Stack traces, SQL text, table names and
 *     driver messages are all reconnaissance for an attacker and noise for a
 *     merchant, so unknown errors become a flat `INTERNAL_ERROR` with the
 *     correlation id as the only handle.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly context: RequestContextService,
    private readonly isProduction: boolean,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body, logLevel } = this.translate(exception);

    const correlationId =
      this.context.correlationId ??
      (request as Request & { correlationId?: string }).correlationId ??
      'unknown';

    const payload: ErrorResponse = {
      success: false,
      error: body,
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
        durationMs: this.context.elapsedMs || undefined,
      },
    };

    // 5xx gets the stack; 4xx is expected traffic and would drown the logs.
    const logContext = `${request.method} ${request.originalUrl} → ${status} [${correlationId}]`;
    if (logLevel === 'error') {
      this.logger.error(
        `${logContext} ${body.code}: ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // A no-op when `Sentry.init()` was never called (no SENTRY_DSN
      // configured) — safe to call unconditionally rather than threading a
      // "is Sentry enabled" flag through every constructor of this filter.
      Sentry.captureException(exception, {
        tags: { correlationId, errorCode: body.code },
        extra: { method: request.method, path: request.originalUrl, tenantId: this.context.tenantId },
      });
    } else if (logLevel === 'warn') {
      this.logger.warn(`${logContext} ${body.code}: ${body.message}`);
    }

    if (exception instanceof RateLimitExceededError) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    response.status(status).json(payload);
  }

  private translate(exception: unknown): {
    status: number;
    body: ErrorBody;
    logLevel: 'error' | 'warn' | 'none';
  } {
    // --- Validation: keep the field-level detail -------------------------
    if (exception instanceof RequestValidationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: {
          code: exception.code,
          message: 'The request contains invalid values',
          details: exception.fieldErrors,
          docsUrl: docsUrlForErrorCode(exception.code),
        },
        logLevel: 'none',
      };
    }

    // --- Tenant boundary: report as 404, and alert -----------------------
    if (exception instanceof CrossTenantAccessError) {
      // Logged at error level even though the client sees a benign 404: reaching
      // here means a query was missing its tenant predicate, which is a bug worth
      // paging someone about.
      this.logger.error(
        `TENANT ISOLATION: ${exception.message} ${JSON.stringify(exception.details)}`,
      );
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          code: ErrorCode.RESOURCE_NOT_FOUND,
          message: 'Resource not found',
          docsUrl: docsUrlForErrorCode(ErrorCode.RESOURCE_NOT_FOUND),
        },
        logLevel: 'none',
      };
    }

    // --- Domain errors: the registry decides the status ------------------
    if (exception instanceof DomainError) {
      const status = statusForErrorCode(exception.code);
      return {
        status,
        body: {
          code: exception.code,
          message: exception.message,
          context: exception.details,
          docsUrl: docsUrlForErrorCode(exception.code),
        },
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    // --- Database errors: translate, never expose -----------------------
    if (exception instanceof QueryFailedError) {
      return this.translateDatabaseError(exception);
    }

    // --- Nest's own exceptions ------------------------------------------
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        status,
        body: {
          code: codeForHttpStatus(status),
          message: Array.isArray(message) ? message.join('; ') : message,
        },
        logLevel: status >= 500 ? 'error' : 'none',
      };
    }

    // --- Anything else --------------------------------------------------
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred. Quote the correlation ID when reporting this.',
        // Only outside production. In production this would leak internals to
        // whoever triggered the error.
        context: this.isProduction
          ? undefined
          : { detail: exception instanceof Error ? exception.message : String(exception) },
      },
      logLevel: 'error',
    };
  }

  /**
   * MySQL driver errors → client-safe codes.
   *
   * `sqlMessage` is never forwarded: it contains table names, column names and
   * often the offending value, which together describe our schema to an attacker.
   */
  private translateDatabaseError(exception: QueryFailedError): {
    status: number;
    body: ErrorBody;
    logLevel: 'error' | 'warn' | 'none';
  } {
    const driver = exception.driverError as MysqlDriverError | undefined;

    switch (driver?.code) {
      case 'ER_DUP_ENTRY':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCode.RESOURCE_CONFLICT,
            message: 'A record with these values already exists',
          },
          logLevel: 'warn',
        };

      case 'ER_NO_REFERENCED_ROW':
      case 'ER_NO_REFERENCED_ROW_2':
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          body: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'A referenced record does not exist',
          },
          logLevel: 'warn',
        };

      case 'ER_ROW_IS_REFERENCED':
      case 'ER_ROW_IS_REFERENCED_2':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCode.RESOURCE_CONFLICT,
            message: 'This record is still referenced by other records and cannot be removed',
          },
          logLevel: 'warn',
        };

      case 'ER_CHECK_CONSTRAINT_VIOLATED':
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          body: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'The submitted values violate a data constraint',
          },
          logLevel: 'warn',
        };

      case 'ER_LOCK_DEADLOCK':
        // Deadlocks are transient by nature, so this is explicitly retryable —
        // telling the client that is more useful than a bare 500.
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCode.CONCURRENT_MODIFICATION,
            message: 'The request conflicted with another operation. Please retry.',
          },
          logLevel: 'warn',
        };

      case 'ER_LOCK_WAIT_TIMEOUT':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCode.CONCURRENT_MODIFICATION,
            message: 'The request timed out waiting on a lock. Please retry.',
          },
          logLevel: 'error',
        };

      case 'ECONNREFUSED':
      case 'PROTOCOL_CONNECTION_LOST':
      case 'ER_CON_COUNT_ERROR':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          body: {
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: 'The service is temporarily unavailable',
          },
          logLevel: 'error',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'A database error occurred',
          },
          logLevel: 'error',
        };
    }
  }
}

function codeForHttpStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.MALFORMED_REQUEST;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.AUTH_TOKEN_INVALID;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.PERMISSION_DENIED;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.RESOURCE_NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.RESOURCE_CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorCode.VALIDATION_FAILED;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCode.SERVICE_UNAVAILABLE;
    case HttpStatus.GATEWAY_TIMEOUT:
      return ErrorCode.REQUEST_TIMEOUT;
    default:
      return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.MALFORMED_REQUEST;
  }
}
