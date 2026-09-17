import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PlatformIntegrationOverviewResponse } from '@ems/contracts';

/**
 * Integration & webhook operations — scoped down to what this codebase's own
 * architecture actually supports, per this session's Phase 0 audit:
 *
 *  - **Channel (marketplace) connections** ARE real, per-tenant, and genuinely
 *    missing a cross-tenant view — `channels` has `type`/`status`/`lastSyncAt`/
 *    `lastError`/`tokenExpiresAt` for every tenant's connection, but nothing reads
 *    it across tenants before this. That's what this service provides.
 *  - **Payment/shipping/DNS provider health** already has a home: Platform Health.
 *    Building a second "integrations" status view of the same configured-provider
 *    data under a different name would be the duplicate functionality the brief
 *    itself says to avoid.
 *  - **Webhook deliveries** (event/tenant/destination/status/HTTP status/attempt
 *    count/retry) are NOT here. This codebase has inbound webhook *receivers* with
 *    replay protection (`processed_events`), not an outbound delivery system — there
 *    is no delivery attempt, status, or retry to show, because nothing sends one.
 *    Building that table and retry queue from scratch is real product work, not a
 *    small addition to an ops page.
 *  - **Manual retry/reconnect** is deliberately not exposed here either: a channel
 *    connection belongs to one tenant, and reconnecting it is that tenant's own
 *    OAuth flow (`POST console/channels/:id/refresh-token`) — a platform admin's
 *    correct path to fix it on a merchant's behalf is impersonation, not a
 *    cross-tenant action button that bypasses whose connection it actually is.
 *
 * `credentials_encrypted` is never selected here, on top of never being returned —
 * the query itself does not read the column a platform admin has no reason to see.
 */
@Injectable()
export class PlatformIntegrationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(): Promise<PlatformIntegrationOverviewResponse> {
    const rows = (await this.dataSource.query(
      // `channels` has no `public_id` column (see this entity's own doc comment) --
      // `c.id` is its only identifier, fine for a read-only ops view with no
      // client-side action that would need to look it up again by id.
      `SELECT c.id AS id, t.public_id AS tenantId, t.business_name AS tenantName,
              c.type, c.status, c.last_sync_at AS lastSyncAt, c.last_error AS lastError,
              c.token_expires_at AS tokenExpiresAt
         FROM channels c
         JOIN tenants t ON t.id = c.tenant_id
        WHERE t.deleted_at IS NULL
        ORDER BY c.status = 'ERROR' DESC, c.last_sync_at DESC`,
    )) as {
      id: string;
      tenantId: string;
      tenantName: string;
      type: string;
      status: string;
      lastSyncAt: Date | null;
      lastError: string | null;
      tokenExpiresAt: Date | null;
    }[];

    return {
      channelConnections: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        type: row.type,
        status: row.status,
        lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
        lastError: row.lastError,
        tokenExpiresAt: row.tokenExpiresAt ? new Date(row.tokenExpiresAt).toISOString() : null,
      })),
    };
  }
}
