import { z } from 'zod';

export const tenantStatusCountSchema = z.object({
  status: z.string(),
  count: z.number(),
});

export const mrrByCurrencySchema = z.object({
  currency: z.string(),
  mrrMinor: z.string(),
});

export const planDistributionEntrySchema = z.object({
  planCode: z.string(),
  planName: z.string(),
  subscriberCount: z.number(),
});

export const platformAnalyticsResponseSchema = z.object({
  totalTenants: z.number(),
  tenantsByStatus: z.array(tenantStatusCountSchema),
  newTenantsLast30Days: z.number(),
  activeSubscriptions: z.number(),
  mrr: z.array(mrrByCurrencySchema),
  planDistribution: z.array(planDistributionEntrySchema),
  openSupportTickets: z.number(),
  pendingSettlements: z.number(),
});
export type PlatformAnalyticsResponse = z.infer<typeof platformAnalyticsResponseSchema>;
