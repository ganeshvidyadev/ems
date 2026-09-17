import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import type { DependencyHealth, IntegrationHealth, PlatformHealthResponse } from '@ems/contracts';
import { REDIS_CLIENT, REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import { ShippingCarrierFactory } from '../../integrations/shipping/shipping-carrier.factory';
import { DnsProviderFactory } from '../../integrations/dns/dns-provider.factory';
import { ChannelAdapterFactory } from '../../integrations/channel/channel-adapter.factory';
import { MailService } from '../notification/mail.service';
import { LogBufferService } from '../logging/log-buffer.service';
import { QueueRegistry } from '../../queues/queue.registry';

/**
 * Platform Health — a Super Admin's answer to "is EMS healthy?", built entirely
 * from real signals already produced elsewhere (no new synthetic metric).
 *
 * Two honest constraints on what "healthy" can mean here:
 *
 *  1. **No live outbound calls to third-party APIs on every dashboard load.**
 *     Payment/shipping/DNS/marketplace health is inferred from configuration
 *     presence plus each queue's own recent-failure count, not a synchronous
 *     ping to Razorpay/Shiprocket/eBay — that would be slow, could itself trip a
 *     provider's rate limits, and turns a dashboard view into an outbound
 *     dependency. Email is the one exception: nodemailer's `verify()` is a cheap
 *     SMTP handshake with no message sent, so it gets a real live check.
 *
 *  2. **`UNKNOWN` is not `HEALTHY`.** A category with no configured provider, or
 *     no recent-failure signal to check against (shipping has no dedicated
 *     retry queue the way payment/DNS/channel-sync do), is reported `UNKNOWN`
 *     rather than assumed fine.
 */
@Injectable()
export class PlatformHealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_QUEUE_CLIENT) private readonly redisQueue: Redis,
    private readonly payments: PaymentGatewayFactory,
    private readonly shipping: ShippingCarrierFactory,
    private readonly dns: DnsProviderFactory,
    private readonly channels: ChannelAdapterFactory,
    private readonly mail: MailService,
    private readonly logs: LogBufferService,
    private readonly queues: QueueRegistry,
  ) {}

  async overview(): Promise<PlatformHealthResponse> {
    const [infra, integrations, queueDepths, errorLogsLastHour] = await Promise.all([
      this.checkInfra(),
      this.checkIntegrations(),
      this.queues.depths(),
      this.countRecentErrorLogs(),
    ]);

    const failedJobsTotal = Object.values(queueDepths).reduce((sum, d) => sum + d.failed, 0);

    return {
      infra,
      integrations,
      recent: {
        failedJobsTotal,
        errorLogsLastHour,
        logPipeline: this.logs.stats,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Infra
  // -------------------------------------------------------------------------

  private async checkInfra(): Promise<DependencyHealth[]> {
    const [mysql, redisCache, redisQueue, mongo] = await Promise.all([
      this.pingMysql(),
      this.pingRedis(this.redis, 'redis-cache'),
      this.pingRedis(this.redisQueue, 'redis-queue'),
      this.pingMongo(),
    ]);
    return [mysql, redisCache, redisQueue, mongo];
  }

  private async pingMysql(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { name: 'mysql', status: 'HEALTHY', latencyMs: Date.now() - started };
    } catch (error) {
      return { name: 'mysql', status: 'DOWN', detail: message(error) };
    }
  }

  private async pingRedis(client: Redis, name: string): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      const pong = await client.ping();
      return pong === 'PONG'
        ? { name, status: 'HEALTHY', latencyMs: Date.now() - started }
        : { name, status: 'DEGRADED', detail: `unexpected ping reply: ${pong}` };
    } catch (error) {
      return { name, status: 'DOWN', detail: message(error) };
    }
  }

  private async pingMongo(): Promise<DependencyHealth> {
    const started = Date.now();
    try {
      if (this.mongo.readyState !== 1) return { name: 'mongo', status: 'DOWN', detail: 'not connected' };
      await this.mongo.db?.admin().ping();
      return { name: 'mongo', status: 'HEALTHY', latencyMs: Date.now() - started };
    } catch (error) {
      return { name: 'mongo', status: 'DOWN', detail: message(error) };
    }
  }

  // -------------------------------------------------------------------------
  // Integrations
  // -------------------------------------------------------------------------

  private async checkIntegrations(): Promise<IntegrationHealth[]> {
    const depths = await this.queues.depths();

    return [
      this.integrationFromQueue('payment', this.payments.configuredGateways(), depths['payment-reconcile']),
      // Shiprocket has no dedicated retry queue of its own — shipment status
      // changes arrive via `shipment-webhook.controller.ts` synchronously, so
      // there is no recent-failure signal to check against, hence UNKNOWN
      // rather than HEALTHY the moment a carrier is configured.
      this.integrationConfiguredOnly('shipping', this.shipping.configuredCarriers()),
      this.integrationFromQueue('dns', this.dns.configuredProviders(), depths['domain-verification']),
      this.integrationFromQueue('marketplace', this.channels.configuredTypes(), depths['channel-sync']),
      await this.emailIntegration(),
    ];
  }

  private integrationFromQueue(
    category: string,
    configuredProviders: string[],
    depth: { failed: number } | undefined,
  ): IntegrationHealth {
    if (configuredProviders.length === 0) {
      return { category, status: 'UNKNOWN', configuredProviders, detail: 'not configured' };
    }
    const recentFailures = depth?.failed ?? 0;
    return {
      category,
      status: recentFailures > 0 ? 'DEGRADED' : 'HEALTHY',
      configuredProviders,
      recentFailures,
      detail: recentFailures > 0 ? `${recentFailures} failed job(s) retained (see Queues)` : undefined,
    };
  }

  private integrationConfiguredOnly(category: string, configuredProviders: string[]): IntegrationHealth {
    if (configuredProviders.length === 0) {
      return { category, status: 'UNKNOWN', configuredProviders, detail: 'not configured' };
    }
    return {
      category,
      status: 'UNKNOWN',
      configuredProviders,
      detail: 'configured, but no recent-failure signal exists to verify against',
    };
  }

  private async emailIntegration(): Promise<IntegrationHealth> {
    if (!this.mail.isConfigured()) {
      return { category: 'email', status: 'UNKNOWN', configuredProviders: [], detail: 'not configured' };
    }
    const result = await this.mail.verifyConnection();
    return {
      category: 'email',
      status: result.ok ? 'HEALTHY' : 'DOWN',
      configuredProviders: ['smtp'],
      detail: result.error,
    };
  }

  // -------------------------------------------------------------------------
  // Recent indicators
  // -------------------------------------------------------------------------

  /**
   * Errors written to Mongo in the last hour. `error_logs` documents carry no
   * dedicated timestamp field (see `LogBufferService`'s own doc comment on why
   * logging never blocks a request) — every ObjectId embeds its creation time,
   * so a range on `_id` is the timestamp query, not a workaround for one.
   */
  private async countRecentErrorLogs(): Promise<number | null> {
    if (this.mongo.readyState !== 1) return null;
    try {
      const oneHourAgo = Types.ObjectId.createFromTime(Math.floor((Date.now() - 60 * 60 * 1000) / 1000));
      return await this.mongo.collection('error_logs').countDocuments({ _id: { $gte: oneHourAgo } });
    } catch {
      return null;
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}
