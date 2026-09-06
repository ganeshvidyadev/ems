import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import type { Request } from 'express';
import { catchError, Observable, of, tap, throwError } from 'rxjs';
import { REDIS_CLIENT } from '../redis/redis.module';
import { IDEMPOTENT_KEY } from '../decorators';
import { IdempotencyKeyReusedError, MalformedRequestError } from '../errors/api.errors';
import { RequestContextService } from '../services/request-context.service';

const TTL_SECONDS = 24 * 60 * 60;

interface StoredResult {
  status: 'IN_PROGRESS' | 'DONE';
  requestHash: string;
  body?: unknown;
}

/**
 * Enforces the `Idempotency-Key` contract from docs/04 §7 on routes marked
 * `@Idempotent()` — checkout, refunds, anything that moves money or creates an
 * external side effect a client might retry.
 *
 * Registered as the **last** global interceptor (after the envelope and
 * logging interceptors), so it sits closest to the controller in the
 * interceptor chain: it stores and replays the controller's raw return value,
 * and that value still passes through envelope-wrapping and logging normally
 * on both the first call and every replay.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly context: RequestContextService,
  ) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    if (!required) return next.handle();

    const request = executionContext.switchToHttp().getRequest<Request>();
    const key = request.headers['idempotency-key'];
    if (!key || typeof key !== 'string') {
      throw new MalformedRequestError('This request requires an Idempotency-Key header');
    }

    const scope = this.context.tenantId ?? 'anon';
    const redisKey = `idem:${scope}:${key}`;
    const requestHash = createHash('sha256').update(JSON.stringify(request.body ?? {})).digest('hex');

    return this.handle(redisKey, key, requestHash, next);
  }

  private handle(
    redisKey: string,
    key: string,
    requestHash: string,
    next: CallHandler,
  ): Observable<unknown> {
    return new Observable((subscriber) => {
      void this.run(redisKey, key, requestHash, next).then(
        (observable) => observable.subscribe(subscriber),
        (error: unknown) => subscriber.error(error),
      );
    });
  }

  private async run(
    redisKey: string,
    key: string,
    requestHash: string,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const acquired = await this.redis.set(
      redisKey,
      JSON.stringify({ status: 'IN_PROGRESS', requestHash } satisfies StoredResult),
      'EX',
      TTL_SECONDS,
      'NX',
    );

    if (!acquired) {
      const raw = await this.redis.get(redisKey);
      const stored = raw ? (JSON.parse(raw) as StoredResult) : null;

      // The lock expired between our SET NX and this GET — vanishingly rare, and
      // safe to treat as a fresh request rather than blocking the client forever.
      if (!stored) return next.handle();

      if (stored.status === 'IN_PROGRESS') {
        throw new IdempotencyKeyReusedError(key);
      }
      if (stored.requestHash !== requestHash) {
        throw new IdempotencyKeyReusedError(key);
      }
      return of(stored.body);
    }

    return next.handle().pipe(
      tap((body) => {
        void this.redis.set(
          redisKey,
          JSON.stringify({ status: 'DONE', requestHash, body } satisfies StoredResult),
          'EX',
          TTL_SECONDS,
        );
      }),
      catchError((error: unknown) => {
        // A failed attempt must not permanently occupy the key — the client's
        // retry (with the *same* key, by definition) needs to actually run.
        void this.redis.del(redisKey);
        return throwError(() => error);
      }),
    );
  }
}
