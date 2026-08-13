import { InvariantViolationError, ValidationError } from '../errors/domain.error.js';

/**
 * Guard clauses for aggregate constructors and factory methods.
 *
 * `assertInvariant` signals a programming error (the caller built an impossible
 * state); `assertValid` signals bad input. They map to different HTTP statuses
 * and different alerting, so the distinction is worth keeping at the call site.
 */

export function assertInvariant(
  condition: unknown,
  message: string,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) throw new InvariantViolationError(message, details);
}

export function assertValid(
  condition: unknown,
  message: string,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) throw new ValidationError(message, details);
}

export function assertPresent<T>(
  value: T | null | undefined,
  name: string,
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new ValidationError(`${name} is required`, { field: name });
  }
}

export function assertNonEmpty(value: string | null | undefined, name: string): asserts value {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`${name} must not be empty`, { field: name });
  }
}

export function assertPositiveInt(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive integer`, { field: name, value });
  }
}

export function assertNonNegativeInt(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative integer`, { field: name, value });
  }
}

export function assertOneOf<T extends readonly unknown[]>(
  value: unknown,
  allowed: T,
  name: string,
): asserts value is T[number] {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`, {
      field: name,
      value,
      allowed,
    });
  }
}

/**
 * Exhaustiveness check for discriminated unions. Placed in a `default:` branch,
 * it turns a newly added union member into a compile error at every switch that
 * has not handled it — which is how order-status handling stays complete as the
 * state machine grows.
 */
export function assertNever(value: never, context = 'value'): never {
  throw new InvariantViolationError(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
