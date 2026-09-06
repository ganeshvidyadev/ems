import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import { ErrorCode } from '@ems/contracts';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { RequestValidationError } from '../errors/api.errors';

/**
 * Validates and *transforms* a payload against a Zod schema.
 *
 * Returns `parse`d output rather than the raw input, which matters: the schemas in
 * `@ems/contracts` coerce query strings to numbers, trim and lowercase emails, and
 * apply defaults. Handing the handler the raw body would discard all of that and
 * leave every controller re-doing it.
 *
 * Used per-parameter via `@Body(new ZodValidationPipe(schema))`, or through the
 * `@Validate()` decorator helper.
 *
 * Typed as `ZodTypeAny` rather than `ZodSchema<T>`: `ZodSchema<T>` is `ZodType<T,
 * ZodTypeDef, T>`, which pins the schema's *input* type equal to its *output* type. That
 * holds for a schema with no defaults/transforms, but list-query schemas built from
 * `listQuerySchema` coerce and default almost every field (`page` is optional on input,
 * required on output) — accepting `ZodTypeAny` and reading the output type via `output<S>`
 * is what lets this pipe validate those without every caller needing its own cast.
 *
 * **Only actually validates a whole-body or whole-query-object parameter —
 * everything else passes through unchanged.** `@Validate()` applies this
 * pipe with `@UsePipes()` at the *method* level, which Nest runs against
 * *every* parameter of the handler, not just the one the schema was written
 * for. `@Validate()` is always meant for the body (see its own doc comment),
 * so any sibling parameter on the same handler — a route param, a
 * single-key `@Query('x')` extraction, or a custom param decorator like
 * `@IdempotencyKey()`/`@CurrentUser()` — must never be handed to this same
 * schema, which is (almost always) an object shape a bare string or a
 * decorator's own return value would never satisfy.
 *
 * Found live, twice, on two different parameter shapes, before this
 * positive allow-list replaced the narrower checks that kept missing a
 * third:
 *  1. `@Param('id')` sibling (Phase 10) — `metadata.type === 'param'`.
 *  2. `@Query('storeId')` sibling (`CartController.addItem`) —
 *     `metadata.type === 'query'`, same as the *legitimate* whole-query-object
 *     case, so `'param'`-only checking missed it; `metadata.data` (the
 *     extracted key name) is what actually distinguishes the two.
 *  3. `@IdempotencyKey()` sibling (`CheckoutController.placeOrder`) —
 *     `metadata.type === 'custom'`, a case neither earlier fix considered at
 *     all, since a custom param decorator's `ArgumentMetadata` isn't
 *     `'param'`/`'query'`/`'body'` in the first place.
 *
 * Rather than keep discovering and excluding one more shape reactively, this
 * is a positive allow-list: only `type === 'body'` (the whole body, always
 * `@Validate()`'s actual target) or `type === 'query'` with no `data` key
 * (a whole-query-object, the direct `@Query(new ZodValidationPipe(...))`
 * usage many list endpoints rely on) are ever validated. Every other
 * combination — any `'param'`, any `'custom'`, or a single-key `data`
 * extraction regardless of type — passes through unchanged, covering shapes
 * not yet found broken as well as the three that were.
 */
@Injectable()
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata: ArgumentMetadata): output<S> {
    const isWholeBody = metadata.type === 'body';
    const isWholeQueryObject = metadata.type === 'query' && !metadata.data;
    if (!isWholeBody && !isWholeQueryObject) return value as output<S>;

    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new RequestValidationError(
          `Validation failed for request ${metadata.type}`,
          flattenZodIssues(error),
        );
      }
      throw error;
    }
  }
}

export interface FieldError {
  field?: string;
  code: string;
  message: string;
}

/**
 * Flattens Zod issues into the envelope's `error.details` shape.
 *
 * Dotted paths (`items.0.quantity`) so a form library can map an error straight
 * onto the offending input. A flat message list forces the client to guess which
 * field failed, which is how a validation error becomes a generic red banner.
 */
export function flattenZodIssues(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : undefined,
    code: mapIssueCode(issue.code),
    message: issue.message,
  }));
}

/** Zod issue codes → our stable client-facing vocabulary. */
function mapIssueCode(zodCode: string): string {
  switch (zodCode) {
    case 'invalid_type':
      return 'invalid_type';
    case 'too_small':
      return 'too_small';
    case 'too_big':
      return 'too_big';
    case 'invalid_string':
      return 'invalid_format';
    case 'invalid_enum_value':
      return 'invalid_option';
    case 'unrecognized_keys':
      return 'unknown_field';
    case 'invalid_union':
      return 'invalid_value';
    case 'custom':
      return 'invalid_value';
    default:
      return ErrorCode.VALIDATION_FAILED.toLowerCase();
  }
}
