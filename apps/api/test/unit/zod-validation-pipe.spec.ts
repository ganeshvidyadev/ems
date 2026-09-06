import type { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../src/common/pipes/zod-validation.pipe';
import { RequestValidationError } from '../../src/common/errors/api.errors';

const bodyMeta: ArgumentMetadata = { type: 'body', metatype: undefined, data: undefined };
const paramMeta: ArgumentMetadata = { type: 'param', metatype: undefined, data: 'id' };
const queryMeta: ArgumentMetadata = { type: 'query', metatype: undefined, data: undefined };

/**
 * `@Validate()` applies this pipe with `@UsePipes()` at the *method* level,
 * which Nest runs against every parameter of the handler — including a
 * sibling `@Param('id') id: string` on the very same handler a body schema
 * is meant for. Found live: a real POST endpoint combining `@Param()` +
 * `@Validate()` + `@Body()` rejected every call with "Expected object,
 * received string" because the route param was validated against the body
 * schema too. These tests pin down the fix and guard the two usages that
 * must keep validating.
 */
describe('ZodValidationPipe', () => {
  const objectSchema = z.object({ name: z.string() });

  it('validates and transforms a body payload', () => {
    const pipe = new ZodValidationPipe(objectSchema);
    expect(pipe.transform({ name: 'widget' }, bodyMeta)).toEqual({ name: 'widget' });
  });

  it('throws RequestValidationError for an invalid body', () => {
    const pipe = new ZodValidationPipe(objectSchema);
    expect(() => pipe.transform({ name: 123 }, bodyMeta)).toThrow(RequestValidationError);
  });

  it('passes a route param through unvalidated, even though it would fail the body schema', () => {
    const pipe = new ZodValidationPipe(objectSchema);
    // A bare string route param would fail `z.object(...)` outright if validated —
    // this must not throw, and must return the value completely unchanged.
    expect(() => pipe.transform('some-route-id', paramMeta)).not.toThrow();
    expect(pipe.transform('some-route-id', paramMeta)).toBe('some-route-id');
  });

  it('still validates and applies coercion/defaults for a query schema (the other real usage of this pipe)', () => {
    const listQuerySchema = z.object({ page: z.coerce.number().default(1), limit: z.coerce.number().default(20) });
    const pipe = new ZodValidationPipe(listQuerySchema);
    expect(pipe.transform({ page: '3' }, queryMeta)).toEqual({ page: 3, limit: 20 });
  });

  it('still throws for an invalid query payload', () => {
    const pipe = new ZodValidationPipe(z.object({ page: z.coerce.number() }));
    expect(() => pipe.transform({ page: 'not-a-number' }, queryMeta)).toThrow(RequestValidationError);
  });
});
