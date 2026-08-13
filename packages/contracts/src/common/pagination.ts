import { z } from 'zod';

/**
 * Query-string contracts for pagination, sorting, filtering and search
 * (docs/04-api-conventions.md §4).
 *
 * Query params arrive as strings, so every numeric field coerces. The `limit`
 * cap is a hard 100: an uncapped limit is both a denial-of-service vector and an
 * accidental bulk-export channel.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Cursor pagination for deeply-paged resources (order exports, log browsing).
 * `OFFSET 50000` makes MySQL walk and discard 50 000 rows; a cursor is an index seek.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export type SortDirection = 'ASC' | 'DESC';
export interface SortClause {
  field: string;
  direction: SortDirection;
}

/**
 * Builds a `?sort=-createdAt,name` parser restricted to an allowlist.
 *
 * The allowlist is not optional: passing an arbitrary column name through to
 * `ORDER BY` is an injection surface and an easy way to trigger a full sort of a
 * large table.
 */
export function sortQuerySchema<const T extends readonly string[]>(
  allowedFields: T,
  defaultSort: readonly SortClause[] = [{ field: 'createdAt', direction: 'DESC' }],
) {
  const allowed = new Set<string>(allowedFields);

  return z
    .string()
    .optional()
    .transform((value, ctx): SortClause[] => {
      if (!value) return [...defaultSort];

      const clauses: SortClause[] = [];
      for (const token of value.split(',')) {
        const trimmed = token.trim();
        if (!trimmed) continue;

        const descending = trimmed.startsWith('-');
        const field = descending ? trimmed.slice(1) : trimmed;

        if (!allowed.has(field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Cannot sort by '${field}'. Sortable fields: ${allowedFields.join(', ')}`,
          });
          continue;
        }
        clauses.push({ field, direction: descending ? 'DESC' : 'ASC' });
      }

      return clauses.length > 0 ? clauses : [...defaultSort];
    });
}

export const FILTER_OPERATORS = [
  'eq',
  'ne',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'between',
  'isnull',
  'contains',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface FilterClause {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
});

export const fieldSelectionQuerySchema = z.object({
  fields: z.string().max(500).optional(),
  /** Allowlisted per resource and depth-capped at 2 — see docs/04 §4. */
  include: z.string().max(500).optional(),
});

/** The common query surface most list endpoints compose from. */
export const listQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .merge(fieldSelectionQuerySchema);
export type ListQuery = z.infer<typeof listQuerySchema>;

export function buildPaginationMeta(page: number, limit: number, total: number) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
