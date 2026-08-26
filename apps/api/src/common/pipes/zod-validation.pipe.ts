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
 */
@Injectable()
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata: ArgumentMetadata): output<S> {
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
