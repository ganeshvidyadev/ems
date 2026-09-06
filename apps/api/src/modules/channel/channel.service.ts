import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { BusinessRuleError, ConflictError, ValidationError } from '@ems/kernel';
import type { AppConfig } from '../../config/configuration';
import { CacheService } from '../../common/services/cache.service';
import { CryptoService } from '../../common/services/crypto.service';
import { RequestContextService } from '../../common/services/request-context.service';
import { ChannelAdapterFactory } from '../../integrations/channel/channel-adapter.factory';
import type { ChannelTokenSet } from '../../integrations/channel/channel-adapter.port';
import type { ChannelEntity, ChannelSettings, ChannelType } from '../../database/entities';
import { ChannelRepository } from './channel.repository';
import { runAsTenant } from '../../common/utils/run-as-tenant.util';

interface PendingOAuthState {
  tenantId: string;
  channelId: string;
}

const OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes — long enough for a merchant to click through the marketplace's own login

/**
 * Connection lifecycle (connect → OAuth callback → connected → disconnect)
 * plus credential encryption/decryption. Publishing, syncing and importing
 * are separate services — this one owns exactly the `channels` row and its
 * OAuth handshake, the same separation `PaymentGatewayFactory` keeps from
 * `CheckoutService`.
 */
@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);
  private readonly app: AppConfig;

  constructor(
    configService: ConfigService,
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly channels: ChannelRepository,
    private readonly adapters: ChannelAdapterFactory,
    private readonly crypto: CryptoService,
    private readonly cache: CacheService,
    private readonly context: RequestContextService,
  ) {
    this.app = configService.getOrThrow<AppConfig>('app');
  }

  /** The API always addresses a store by its public id — resolved to the internal id `channels.store_id` actually stores. */
  private async resolveStoreId(storePublicId: string): Promise<string> {
    const rows = (await this.manager.query(`SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`, [
      storePublicId,
      this.context.requireTenantId('connect channel'),
    ])) as { id: string }[];
    const storeId = rows[0]?.id;
    if (!storeId) throw new ValidationError(`Store '${storePublicId}' does not belong to this tenant`);
    return storeId;
  }

  private get redirectUri(): string {
    return `${this.app.consoleUrl.replace(/\/$/, '')}/channels/oauth/callback`;
  }

  /** Starts (or restarts) a connection — returns the URL to send the merchant to. */
  async startConnect(storePublicId: string, type: ChannelType, name: string): Promise<{ channel: ChannelEntity; authorizeUrl: string }> {
    const adapter = this.adapters.resolve(type); // throws for an unimplemented/misconfigured type before anything is written
    const storeId = await this.resolveStoreId(storePublicId);

    const existing = await this.channels.findByStoreAndType(storeId, type);
    if (existing && existing.status === 'CONNECTED') {
      throw new ConflictError(`This store already has a connected ${type} channel`);
    }

    const channel = existing
      ? Object.assign(existing, { name, status: 'CONNECTING' as const, lastError: null })
      : this.channels.create({ storeId, type, name, status: 'CONNECTING' });
    const saved = await this.channels.saveOne(channel);

    const state = this.crypto.generateToken(24);
    await this.cache.set(
      this.stateCacheKey(state),
      { tenantId: saved.tenantId, channelId: saved.id } satisfies PendingOAuthState,
      OAUTH_STATE_TTL_SECONDS,
    );

    return { channel: saved, authorizeUrl: adapter.buildAuthorizeUrl(this.redirectUri, state) };
  }

  /**
   * Completes the handshake. Runs with **no ambient tenant context** — this is
   * hit by the marketplace's own redirect, not an authenticated console
   * request, so the tenant is recovered from the `state` the cache remembers
   * from `startConnect`, not a JWT. See `runAsTenant`'s own doc comment.
   */
  async completeOAuth(code: string, state: string): Promise<{ tenantId: string; channelId: string }> {
    const pending = await this.cache.get<PendingOAuthState>(this.stateCacheKey(state));
    if (!pending) {
      throw new BusinessRuleError('This connection request has expired or was already used — start again from the channel list');
    }
    await this.cache.del(this.stateCacheKey(state));

    await runAsTenant(this.context, pending.tenantId, async () => {
      const channel = await this.channels.findOneOrFail({ where: { id: pending.channelId } });
      const adapter = this.adapters.resolve(channel.type);

      try {
        const tokenSet = await adapter.exchangeCodeForToken(code, this.redirectUri);
        channel.credentialsEncrypted = this.encryptTokenSet(tokenSet);
        channel.externalAccountId = tokenSet.externalAccountId ?? channel.externalAccountId;
        channel.tokenExpiresAt = tokenSet.expiresAt;
        channel.status = 'CONNECTED';
        channel.lastError = null;
      } catch (error) {
        channel.status = 'ERROR';
        channel.lastError = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      }
      await this.channels.saveOne(channel);
    });

    return pending;
  }

  async disconnect(channelId: string): Promise<ChannelEntity> {
    const channel = await this.channels.findOneOrFail({ where: { id: channelId } });
    channel.status = 'DISCONNECTED';
    channel.credentialsEncrypted = null;
    channel.tokenExpiresAt = null;
    return this.channels.saveOne(channel);
  }

  async configure(
    channelId: string,
    patch: { name?: string; settings?: ChannelSettings; inventoryBuffer?: number; autoPublish?: boolean; autoImportOrders?: boolean },
  ): Promise<ChannelEntity> {
    const channel = await this.channels.findOneOrFail({ where: { id: channelId } });
    Object.assign(channel, patch);
    return this.channels.saveOne(channel);
  }

  async list(storePublicId: string): Promise<ChannelEntity[]> {
    const storeId = await this.resolveStoreId(storePublicId);
    return this.channels.listForStore(storeId);
  }

  async get(channelId: string): Promise<ChannelEntity> {
    return this.channels.findOneOrFail({ where: { id: channelId } });
  }

  /** Decrypts a channel's stored OAuth token set — the one place plaintext credentials briefly exist. */
  decryptCredentials(channel: ChannelEntity): ChannelTokenSet {
    if (!channel.credentialsEncrypted) {
      throw new BusinessRuleError(`Channel '${channel.id}' has no stored credentials — reconnect it`);
    }
    const parsed = JSON.parse(this.crypto.decrypt(channel.credentialsEncrypted)) as ChannelTokenSet & { expiresAt: string };
    return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
  }

  /** For `ChannelTokenService` after a successful proactive refresh — the encryption half of `decryptCredentials`. */
  encryptTokenSet(tokenSet: ChannelTokenSet): Buffer {
    return this.crypto.encrypt(JSON.stringify(tokenSet));
  }

  private stateCacheKey(state: string): string {
    return `channel-oauth-state:${state}`;
  }
}
