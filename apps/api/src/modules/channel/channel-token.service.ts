import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { OutboxService } from '../../common/services/outbox.service';
import { ChannelAdapterFactory } from '../../integrations/channel/channel-adapter.factory';
import { ChannelRepository } from './channel.repository';
import { ChannelService } from './channel.service';

/** How far ahead of actual expiry to attempt a proactive refresh. */
export const TOKEN_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export type TokenCheckOutcome = 'STILL_VALID' | 'REFRESHED' | 'EXPIRED_ALERTED';

/**
 * Proactive token refresh + expiry alerting (docs/05 Phase 10's own exit
 * criterion: "an expired token raises a merchant-visible alert rather than
 * silently failing"). `ChannelRepository.findConnectedWithTokenExpiringBy`
 * is the sweep's cross-tenant worklist; this handles exactly one channel,
 * assuming the caller has already switched context to its tenant.
 */
@Injectable()
export class ChannelTokenService {
  private readonly logger = new Logger(ChannelTokenService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly channels: ChannelRepository,
    private readonly channelService: ChannelService,
    private readonly adapters: ChannelAdapterFactory,
    private readonly outbox: OutboxService,
  ) {}

  async checkAndRefresh(channelId: string): Promise<TokenCheckOutcome> {
    const channel = await this.channels.findOneOrFail({ where: { id: channelId } });
    if (!channel.tokenExpiresAt || !channel.isTokenExpiringSoon(TOKEN_REFRESH_WINDOW_MS)) {
      return 'STILL_VALID';
    }

    const credentials = this.channelService.decryptCredentials(channel);
    if (!credentials.refreshToken) {
      await this.markExpiredAndAlert(channel.id, channel.tenantId, channel.type, 'No refresh token was ever stored for this connection');
      return 'EXPIRED_ALERTED';
    }

    try {
      const adapter = this.adapters.resolve(channel.type);
      const refreshed = await adapter.refreshToken(credentials.refreshToken);

      channel.credentialsEncrypted = this.channelService.encryptTokenSet(refreshed);
      channel.tokenExpiresAt = refreshed.expiresAt;
      channel.status = 'CONNECTED';
      channel.lastError = null;
      await this.channels.saveOne(channel);

      this.logger.log(`Refreshed token for channel ${channelId} (${channel.type}), now expires ${refreshed.expiresAt.toISOString()}`);
      return 'REFRESHED';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markExpiredAndAlert(channel.id, channel.tenantId, channel.type, message);
      return 'EXPIRED_ALERTED';
    }
  }

  private async markExpiredAndAlert(channelId: string, tenantId: string, type: string, reason: string): Promise<void> {
    await this.manager.transaction(async (tx) => {
      await tx.query(`UPDATE channels SET status = 'TOKEN_EXPIRED', last_error = ? WHERE id = ?`, [reason.slice(0, 1000), channelId]);
      await this.outbox.emit(tx, {
        aggregateType: 'channel',
        aggregateId: channelId,
        eventType: 'channel.token_expired',
        payload: { channelId, type, reason },
        tenantId,
      });
    });

    this.logger.warn(`Channel ${channelId} (${type}) token could not be refreshed and is now expired: ${reason}`);
  }
}
