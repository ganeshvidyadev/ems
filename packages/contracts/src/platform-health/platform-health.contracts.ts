import { z } from 'zod';

/**
 * `UNKNOWN` is a real, distinct state — not a synonym for `HEALTHY`. It means either
 * the integration is not configured, or it is configured but no recent-failure signal
 * exists to verify against (see the API service's own doc comment for which
 * categories that applies to). Reporting `HEALTHY` in that case would be exactly the
 * "healthy because nothing errored" false confidence this endpoint exists to avoid.
 */
export const healthStatusSchema = z.enum(['HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const dependencyHealthSchema = z.object({
  name: z.string(),
  status: healthStatusSchema,
  latencyMs: z.number().optional(),
  detail: z.string().optional(),
});
export type DependencyHealth = z.infer<typeof dependencyHealthSchema>;

export const integrationHealthSchema = z.object({
  category: z.string(),
  status: healthStatusSchema,
  configuredProviders: z.array(z.string()),
  recentFailures: z.number().optional(),
  detail: z.string().optional(),
});
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;

export const platformHealthResponseSchema = z.object({
  infra: z.array(dependencyHealthSchema),
  integrations: z.array(integrationHealthSchema),
  recent: z.object({
    failedJobsTotal: z.number(),
    errorLogsLastHour: z.number().nullable(),
    logPipeline: z.object({
      buffered: z.number(),
      dropped: z.number(),
      failedFlushes: z.number(),
      capacity: z.number(),
    }),
  }),
  checkedAt: z.string(),
});
export type PlatformHealthResponse = z.infer<typeof platformHealthResponseSchema>;
