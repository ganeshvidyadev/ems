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
 * **Passes a route param (`metadata.type === 'param'`) through unvalidated.**
 * `@Validate()` applies this pipe with `@UsePipes()` at the *method* level,
 * which Nest runs against every parameter of the handler — including a
 * sibling `@Param('id') id: string`, even though `@Validate()`'s schema is
 * always meant for the body (see its own doc comment). Without this guard,
 * the body schema (always an object) was also asked to validate the route
 * param (a bare string) and rejected it with "Expected object, received
 * string" on any handler combining the two — a real, previously-undiscovered
 * bug found live in this session, on a pattern (`@Param()` + `@Validate()` +
 * `@Body()` together) used across most of this API's write endpoints. It
 * went unnoticed this long because nothing had exercised these endpoints
 * over real HTTP with both a route param and a body present until now.
 *
 * Narrowly scoped to `'param'` rather than "only 'body'": this same class is
 * also used directly as `@Query(new ZodValidationPipe(listQuerySchema))`
 * across many list endpoints, where validation (and the coercion/defaults
 * those schemas apply) must keep running — only the method-level
 * `@UsePipes()` case is actually the bug.
 */
@Injectable()
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata: ArgumentMetadata): output<S> {
    if (metadata.type === 'param') return value as output<S>;

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
