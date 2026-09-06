import { z } from 'zod';

export const REPORT_TYPES = [
  'SALES',
  'REVENUE',
  'ORDERS',
  'CUSTOMERS',
  'INVENTORY',
  'TAX',
  'PAYMENTS',
  'SHIPPING',
  'COMMISSION',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ['CSV', 'JSON'] as const;

/** Inline (small, synchronous) sales/revenue/order summary for a date range — dashboard use. */
export const salesSummaryQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  storeId: z.string().optional(),
  channel: z.string().optional(),
});
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;

export const salesSummaryResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  ordersCount: z.number(),
  itemsCount: z.number(),
  grossMinor: z.string(),
  discountMinor: z.string(),
  taxMinor: z.string(),
  shippingMinor: z.string(),
  refundMinor: z.string(),
  netMinor: z.string(),
  newCustomers: z.number(),
  returningCustomers: z.number(),
  currency: z.string(),
  byDay: z.array(
    z.object({
      date: z.string(),
      ordersCount: z.number(),
      grossMinor: z.string(),
      netMinor: z.string(),
    }),
  ),
});
export type SalesSummaryResponse = z.infer<typeof salesSummaryResponseSchema>;

/** Async, exportable report — the CSV/large-range path, tracked via `job_runs`. */
export const generateReportRequestSchema = z.object({
  type: z.enum(REPORT_TYPES),
  from: z.string().date(),
  to: z.string().date(),
  storeId: z.string().optional(),
  channel: z.string().optional(),
  format: z.enum(REPORT_FORMATS).default('CSV'),
});
export type GenerateReportRequest = z.infer<typeof generateReportRequestSchema>;

export const generateReportResponseSchema = z.object({
  jobId: z.string(),
  status: z.string(),
});
export type GenerateReportResponse = z.infer<typeof generateReportResponseSchema>;
