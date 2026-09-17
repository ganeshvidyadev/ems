import { z } from 'zod';
import { PLAN_LIMIT_KEYS } from '../plan/plan.contracts.js';

export const tenantQuotaRowSchema = z.object({
  limitKey: z.enum(PLAN_LIMIT_KEYS),
  current: z.number(),
  /** -1 means unlimited (matches the API's own `UNLIMITED` sentinel). */
  max: z.number(),
  /** null when unlimited — a percentage of infinity isn't a real number. */
  percentage: z.number().nullable(),
});

export const tenantQuotaSchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  planCode: z.string(),
  quotas: z.array(tenantQuotaRowSchema),
});

export const platformQuotaOverviewResponseSchema = z.object({
  tenants: z.array(tenantQuotaSchema),
});
export type PlatformQuotaOverviewResponse = z.infer<typeof platformQuotaOverviewResponseSchema>;
