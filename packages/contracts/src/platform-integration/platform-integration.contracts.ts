import { z } from 'zod';

/**
 * Per-tenant marketplace channel connections, across every tenant — the "who is
 * connected to what, and is it healthy" visibility item 8 of the brief actually asks
 * for. `credentialsEncrypted` is never in this response (nor read by the query that
 * builds it) — see `PlatformIntegrationService`'s own doc comment for what this
 * deliberately does NOT cover and why.
 */
export const platformChannelConnectionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  tenantName: z.string(),
  type: z.string(),
  status: z.string(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  tokenExpiresAt: z.string().nullable(),
});
export type PlatformChannelConnection = z.infer<typeof platformChannelConnectionSchema>;

export const platformIntegrationOverviewResponseSchema = z.object({
  channelConnections: z.array(platformChannelConnectionSchema),
});
export type PlatformIntegrationOverviewResponse = z.infer<typeof platformIntegrationOverviewResponseSchema>;
