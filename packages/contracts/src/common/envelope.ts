import { z } from 'zod';

/**
 * The response envelope (docs/04-api-conventions.md §2).
 *
 * Success and failure share one shape so a client never has to inspect the
 * response *structure* before it can inspect the *outcome*. Branching on shape
 * is where clients mishandle errors.
 */

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const cursorMetaSchema = z.object({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable(),
  hasNext: z.boolean(),
});
export type CursorMeta = z.infer<typeof cursorMetaSchema>;

export const responseMetaSchema = z.object({
  /** Present on EVERY response, success or error — the log-lookup key. */
  correlationId: z.string(),
  timestamp: z.string().datetime(),
  pagination: paginationMetaSchema.optional(),
  cursor: cursorMetaSchema.optional(),
  /** Server-side duration in ms; useful for client-side perf triage. */
  durationMs: z.number().optional(),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export const errorDetailSchema = z.object({
  field: z.string().optional(),
  code: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorBodySchema = z.object({
  /** Stable machine-readable enum. Branch on this, never on `message`. */
  code: z.string(),
  message: z.string(),
  details: z.array(errorDetailSchema).optional(),
  /** Structured extras (e.g. PLAN_QUOTA_EXCEEDED's limitKey/current/max). */
  context: z.record(z.unknown()).optional(),
  docsUrl: z.string().url().optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: errorBodySchema,
  meta: responseMetaSchema,
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Wraps a data schema in the success envelope. */
export function successResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    meta: responseMetaSchema,
  });
}

/** Wraps an item schema in the paginated success envelope. */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    meta: responseMetaSchema.extend({ pagination: paginationMetaSchema }),
  });
}

/** Discriminated union for clients that want exhaustive handling. */
export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion('success', [successResponseSchema(data), errorResponseSchema]);
}

export type SuccessResponse<T> = {
  success: true;
  data: T;
  meta: ResponseMeta;
};

export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: ResponseMeta & { pagination: PaginationMeta };
};

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export function isErrorResponse<T>(response: ApiResponse<T>): response is ErrorResponse {
  return response.success === false;
}
