import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import type { DomainsConfig } from '../../../config/configuration';
import type { DnsProviderPort } from '../dns-provider.port';

const API_BASE = 'https://api.cloudflare.com/client/v4';

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

/**
 * Publishes ACME DNS-01 TXT records inside the platform's own Cloudflare
 * zone (`DomainsConfig.challengeDelegateDomain`) — never a merchant's zone,
 * see `DnsProviderPort`'s doc comment for why. The zone id is resolved once
 * and cached; every subsequent record write is a single authenticated call.
 */
@Injectable()
export class CloudflareDnsAdapter implements DnsProviderPort {
  readonly name = 'cloudflare' as const;
  private readonly logger = new Logger(CloudflareDnsAdapter.name);
  private readonly config: DomainsConfig;
  private cachedZoneId: string | null = null;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<DomainsConfig>('domains');
  }

  isConfigured(): boolean {
    return Boolean(this.config.cloudflare.apiToken && this.config.challengeDelegateDomain);
  }

  async createTxtRecord(subdomain: string, value: string): Promise<{ recordId: string }> {
    const zoneId = await this.zoneId();
    const name = `${subdomain}.${this.config.challengeDelegateDomain}`;

    const body = await this.request<{ id: string }>('POST', `/zones/${zoneId}/dns_records`, {
      type: 'TXT',
      name,
      content: value,
      ttl: 120,
    });

    // Cloudflare's own record id is all the port's caller ever needs back; the
    // zone id it belongs to is this adapter's own concern, not exposed as state
    // the caller has to thread through — re-resolved (from cache) on delete.
    return { recordId: body.id };
  }

  async deleteTxtRecord(recordId: string): Promise<void> {
    const zoneId = await this.zoneId();
    await this.request('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
  }

  private async zoneId(): Promise<string> {
    if (this.cachedZoneId) return this.cachedZoneId;

    const zones = await this.request<Array<{ id: string; name: string }>>(
      'GET',
      `/zones?name=${encodeURIComponent(this.config.challengeDelegateDomain)}`,
    );
    const zone = zones[0];
    if (!zone) {
      throw new ExternalServiceError(
        'cloudflare',
        `No Cloudflare zone found for '${this.config.challengeDelegateDomain}' (ACME_CHALLENGE_DELEGATE_DOMAIN)`,
      );
    }
    this.cachedZoneId = zone.id;
    return zone.id;
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('cloudflare', 'Cloudflare DNS credentials are not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.cloudflare.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const envelope = (await response.json()) as CloudflareEnvelope<T>;

      if (!response.ok || !envelope.success) {
        const detail = envelope.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
        throw new ExternalServiceError('cloudflare', `Cloudflare API request failed: ${detail}`, {
          status: response.status,
          path,
        });
      }

      return envelope.result;
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ExternalServiceError('cloudflare', `Cloudflare API request errored: ${message}`, { path });
    } finally {
      clearTimeout(timeout);
    }
  }
}
