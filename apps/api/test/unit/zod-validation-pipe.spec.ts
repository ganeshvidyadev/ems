import type { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../src/common/pipes/zod-validation.pipe';
import { RequestValidationError } from '../../src/common/errors/api.errors';

const bodyMeta: ArgumentMetadata = { type: 'body', metatype: undefined, data: undefined };
const paramMeta: ArgumentMetadata = { type: 'param', metatype: undefined, data: 'id' };
const queryMeta: ArgumentMetadata = { type: 'query', metatype: undefined, data: undefined };
const singleKeyQueryMeta: ArgumentMetadata = { type: 'query', metatype: undefined, data: 'storeId' };
const customMeta: ArgumentMetadata = { type: 'custom', metatype: undefined, data: undefined };

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

  it('passes a single-key query extraction through unvalidated, same as a route param', () => {
    // Found live on `CartController.addItem`: `@Query('storeId') storeId: string`
    // sharing a handler with `@Validate(addCartItemRequestSchema)` — the
    // `'param'`-only guard missed this because it's `metadata.type === 'query'`,
    // not `'param'`, even though it is exactly the same single-key-extraction
    // shape. `metadata.data` (the key name), not `metadata.type`, is what
    // actually distinguishes this from the whole-object query case above.
    const pipe = new ZodValidationPipe(objectSchema);
    expect(() => pipe.transform('01M1STOREID', singleKeyQueryMeta)).not.toThrow();
    expect(pipe.transform('01M1STOREID', singleKeyQueryMeta)).toBe('01M1STOREID');
  });

  it('passes a custom param decorator through unvalidated', () => {
    // Found live on `CheckoutController.placeOrder`: `@IdempotencyKey() idempotencyKey: string | null`
    // sharing a handler with `@Validate(placeOrderRequestSchema)` — a custom
    // param decorator's `ArgumentMetadata` is `type: 'custom'`, a shape
    // neither the `'param'`-only nor the `metadata.data` check considered.
    const pipe = new ZodValidationPipe(objectSchema);
    expect(() => pipe.transform('some-idempotency-key', customMeta)).not.toThrow();
    expect(pipe.transform('some-idempotency-key', customMeta)).toBe('some-idempotency-key');
    // Also exercises the null case `@IdempotencyKey()` itself can return.
    expect(pipe.transform(null, customMeta)).toBeNull();
  });
});
