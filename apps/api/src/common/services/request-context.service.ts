import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { TenantContextMissingError } from '@ems/kernel';

export interface RequestContext {
  /** Present on every context — the key that stitches logs, events and jobs together. */
  correlationId: string;

  /** NULL for platform-admin routes and for system/cron work. */
  tenantId: string | null;
  tenantSlug?: string | null;
  tenantStatus?: string | null;
  storeId?: string | null;

  userId?: string | null;
  userType?: 'PLATFORM' | 'TENANT' | null;
  customerId?: string | null;
  /** Resolved permission codes; the guard reads these, not the DB. */
  permissions?: readonly string[];
  roles?: readonly string[];
  planCode?: string | null;

  /** Which route tree served the request — drives the tenant-resolution strategy. */
  surface: 'console' | 'storefront' | 'platform' | 'webhook' | 'system';

  ip?: string | null;
  userAgent?: string | null;

  /** Set on the event a handler is processing, so emitted events record causation. */
  causationId?: string | null;

  startedAt: number;
}

/**
 * Ambient request context backed by `AsyncLocalStorage`.
 *
 * Why ALS and not a request-scoped provider: marking a provider `REQUEST`-scoped
 * forces every provider that injects it — and everything above it in the graph —
 * to be instantiated per request. On a hot path that is a measurable throughput
 * loss for what is really just three ids. ALS gives the same implicit context at
 * singleton speed.
 *
 * It also works unchanged inside BullMQ processors, which have no HTTP request at
 * all: the job payload carries the context and the processor re-opens the store.
 * A request-scoped provider has nothing to bind to there, which is exactly where
 * tenant context is easiest to lose and most dangerous to lose.
 */
@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContext>();

  /**
   * Runs `callback` with `context` active for the whole async subtree.
   *
   * `run` rather than `enterWith`: `run` scopes the store to the callback, so it
   * cannot leak into unrelated work on the same tick. `enterWith` mutates the
   * current async resource and has bitten enough people to be worth avoiding.
   */
  run<T>(context: RequestContext, callback: () => T): T {
    return RequestContextService.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return RequestContextService.storage.getStore();
  }

  /** Throws if no context is active — for code paths that genuinely require one. */
  require(operation = 'unknown'): RequestContext {
    const context = this.get();
    if (!context) throw new TenantContextMissingError(operation);
    return context;
  }

  get correlationId(): string | undefined {
    return this.get()?.correlationId;
  }

  get tenantId(): string | null {
    return this.get()?.tenantId ?? null;
  }

  /**
   * Tenant id, or throw. Used by `TenantScopedRepository` — a query that should be
   * tenant-filtered but has no tenant must fail loudly rather than quietly return
   * every tenant's rows.
   */
  requireTenantId(operation = 'tenant-scoped query'): string {
    const tenantId = this.tenantId;
    if (!tenantId) throw new TenantContextMissingError(operation);
    return tenantId;
  }

  get storeId(): string | null {
    return this.get()?.storeId ?? null;
  }

  get userId(): string | null {
    return this.get()?.userId ?? null;
  }

  get surface(): RequestContext['surface'] {
    return this.get()?.surface ?? 'system';
  }

  get isPlatformRequest(): boolean {
    return this.get()?.userType === 'PLATFORM';
  }

  get permissions(): readonly string[] {
    return this.get()?.permissions ?? [];
  }

  hasPermission(code: string): boolean {
    return this.permissions.includes(code);
  }

  /** Shallow-merges into the active context. No-op when none is active. */
  patch(patch: Partial<RequestContext>): void {
    const context = this.get();
    if (context) Object.assign(context, patch);
  }

  /** Elapsed ms since the context opened — the source of the `durationMs` meta field. */
  get elapsedMs(): number {
    const context = this.get();
    return context ? Date.now() - context.startedAt : 0;
  }

  /**
   * Runs `callback` in a context derived from the current one but with no tenant.
   *
   * Needed by genuinely cross-tenant work — the outbox relay reading every
   * tenant's pending events, platform reporting. Deliberately explicit and
   * awkward to type, because "turn off tenant isolation here" should never be
   * something a reader has to infer.
   */
  runWithoutTenant<T>(callback: () => T, reason: string): T {
    const current = this.get();
    const context: RequestContext = {
      correlationId: current?.correlationId ?? 'system',
      tenantId: null,
      surface: 'system',
      startedAt: Date.now(),
      userType: current?.userType ?? null,
      userId: current?.userId ?? null,
      causationId: reason,
    };
    return this.run(context, callback);
  }

  /** Builds a context for background work, where there is no inbound request. */
  static systemContext(overrides: Partial<RequestContext> = {}): RequestContext {
    return {
      correlationId: overrides.correlationId ?? 'system',
      tenantId: overrides.tenantId ?? null,
      surface: 'system',
      startedAt: Date.now(),
      ...overrides,
    };
  }
}
