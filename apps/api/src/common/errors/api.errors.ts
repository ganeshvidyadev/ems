import { DomainError } from '@ems/kernel';
import { ErrorCode } from '@ems/contracts';
import type { FieldError } from '../pipes/zod-validation.pipe';

/**
 * Transport-layer errors.
 *
 * Domain errors live in `@ems/kernel` and know nothing about HTTP — that is what
 * lets an aggregate run unchanged inside a queue processor, where "404" is
 * meaningless. These are the errors that only make sense at the API edge.
 */

export class RequestValidationError extends DomainError {
  readonly code = ErrorCode.VALIDATION_FAILED;

  constructor(
    message: string,
    readonly fieldErrors: FieldError[],
  ) {
    super(message, { fieldErrors });
  }
}

export class MalformedRequestError extends DomainError {
  readonly code = ErrorCode.MALFORMED_REQUEST;
}

export class AuthTokenMissingError extends DomainError {
  readonly code = ErrorCode.AUTH_TOKEN_MISSING;

  constructor() {
    super('Authentication required');
  }
}

export class AuthTokenInvalidError extends DomainError {
  readonly code = ErrorCode.AUTH_TOKEN_INVALID;

  constructor(message = 'Invalid authentication token') {
    super(message);
  }
}

export class AuthTokenExpiredError extends DomainError {
  readonly code = ErrorCode.AUTH_TOKEN_EXPIRED;

  constructor() {
    super('Access token has expired');
  }
}

export class AuthTokenRevokedError extends DomainError {
  readonly code = ErrorCode.AUTH_TOKEN_REVOKED;

  constructor() {
    super('This session has been revoked');
  }
}

export class PermissionDeniedError extends DomainError {
  readonly code = ErrorCode.PERMISSION_DENIED;

  constructor(required: string | string[]) {
    const permissions = Array.isArray(required) ? required : [required];
    // Naming the missing permission is intentional: it is not sensitive (the
    // catalogue is documented), and it turns "403" into an actionable message for
    // the store owner who needs to grant it.
    super(`Missing required permission: ${permissions.join(' or ')}`, { required: permissions });
  }
}

export class TenantSuspendedError extends DomainError {
  readonly code = ErrorCode.TENANT_SUSPENDED;

  constructor(reason?: string | null) {
    super(reason ? `This store is suspended: ${reason}` : 'This store is suspended', { reason });
  }
}

export class SubscriptionPastDueError extends DomainError {
  readonly code = ErrorCode.SUBSCRIPTION_PAST_DUE;

  constructor(upgradeUrl?: string) {
    super('Subscription payment is past due; writes are disabled until payment succeeds', {
      upgradeUrl,
    });
  }
}

export class RateLimitExceededError extends DomainError {
  readonly code = ErrorCode.RATE_LIMIT_EXCEEDED;

  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests', { retryAfterSeconds });
  }
}

export class IdempotencyKeyReusedError extends DomainError {
  readonly code = ErrorCode.IDEMPOTENCY_KEY_REUSED;

  constructor(key: string) {
    super(
      'This idempotency key was already used with a different request body',
      { idempotencyKey: key },
    );
  }
}

export class WebhookSignatureInvalidError extends DomainError {
  readonly code = ErrorCode.PAYMENT_SIGNATURE_INVALID;

  constructor(provider: string) {
    super(`Invalid webhook signature from ${provider}`, { provider });
  }
}
