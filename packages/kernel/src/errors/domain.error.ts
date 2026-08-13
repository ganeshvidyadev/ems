/**
 * Base class for domain failures.
 *
 * Framework-free by design: the domain layer must not import from NestJS, so it
 * cannot throw `HttpException`. The API's global exception filter maps `code` to
 * an HTTP status, which keeps transport concerns out of the domain and lets the
 * same aggregate run inside a queue processor where "404" is meaningless.
 */
export abstract class DomainError extends Error {
  /** Machine-readable code from the registry in docs/04-api-conventions.md §10. */
  abstract readonly code: string;

  /** Additional context surfaced to the client — must never contain PII or SQL. */
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    // Without this, `instanceof` fails for subclasses when the build targets
    // ES5-era prototypes, which is a genuinely confusing class of bug.
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

export class NotFoundError extends DomainError {
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resource: string, identifier?: string | number) {
    super(
      identifier === undefined ? `${resource} not found` : `${resource} '${identifier}' not found`,
      { resource, identifier },
    );
  }
}

export class ConflictError extends DomainError {
  readonly code = 'RESOURCE_CONFLICT';
}

export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';
}

/** An aggregate invariant was violated — indicates a bug, not bad user input. */
export class InvariantViolationError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/**
 * A tenant boundary was crossed. Always mapped to **404**, never 403 — a 403
 * confirms the row exists, which is itself an information leak across tenants.
 */
export class CrossTenantAccessError extends DomainError {
  readonly code = 'CROSS_TENANT_ACCESS';

  constructor(entity: string, expectedTenantId: unknown, actualTenantId: unknown) {
    super(`Cross-tenant access attempted on ${entity}`, {
      entity,
      expectedTenantId,
      actualTenantId,
    });
  }
}

/** No tenant in the AsyncLocalStorage store where one was required. */
export class TenantContextMissingError extends DomainError {
  readonly code = 'TENANT_CONTEXT_MISSING';

  constructor(operation: string) {
    super(`Operation '${operation}' requires a tenant context but none was present`, {
      operation,
    });
  }
}

export class PlanQuotaExceededError extends DomainError {
  readonly code = 'PLAN_QUOTA_EXCEEDED';

  constructor(limitKey: string, current: number, max: number, upgradeUrl?: string) {
    super(`Plan limit '${limitKey}' exceeded (${current}/${max})`, {
      limitKey,
      current,
      max,
      upgradeUrl,
    });
  }
}

export class ConcurrencyError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';

  constructor(entity: string, id: unknown) {
    super(`${entity} was modified concurrently; retry with the current version`, { entity, id });
  }
}

export class ExternalServiceError extends DomainError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';

  constructor(
    readonly provider: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(`[${provider}] ${message}`, { provider, ...details });
  }
}
