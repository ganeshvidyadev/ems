import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Connection } from 'mongoose';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { Public } from '../../common/decorators';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Health probes (docs/01 §9).
 *
 * Three endpoints, because Kubernetes asks three different questions and
 * conflating them causes outages:
 *
 *  - **`/live`** — is the process responsive? Touches **no dependencies**. This is
 *    deliberate and important: if liveness checked Redis, a 30-second Redis blip
 *    would make Kubernetes kill and restart every API pod simultaneously, turning a
 *    degraded cache into a total outage.
 *  - **`/ready`** — can this pod serve traffic? Checks MySQL and Redis, so a pod
 *    with a broken connection is removed from the load balancer without being killed.
 *  - **`/startup`** — has the schema been migrated? Prevents a pod from serving
 *    against a database it does not match.
 */
@ApiTags('health')
// VERSION_NEUTRAL: probe URLs are an infrastructure contract with Kubernetes, not
// product API. `setGlobalPrefix(exclude)` skips the `/api` prefix but URI
// versioning still prepends `/v1`, which would make the liveness path change on
// every API version bump — and a probe URL that moves is a probe that silently
// starts failing.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@ApiExcludeController()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness — process responsiveness only' })
  live(): RawResponse<{ status: string; uptime: number }> {
    return new RawResponse({ status: 'ok', uptime: Math.floor(process.uptime()) });
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — dependency reachability' })
  async ready(): Promise<RawResponse<Record<string, unknown>>> {
    const [mysql, redis] = await Promise.all([this.checkMysql(), this.checkRedis()]);

    // Mongo is checked but NOT gating: it holds only logs and analytics, so a Mongo
    // outage degrades observability rather than the product. Failing readiness on
    // it would take the storefront down to protect a log store.
    const mongo = await this.checkMongo();

    const healthy = mysql.status === 'up' && redis.status === 'up';
    const body = {
      status: healthy ? 'ok' : 'degraded',
      dependencies: { mysql, redis, mongo },
      timestamp: new Date().toISOString(),
    };

    if (!healthy) throw new ServiceUnavailableException(body);
    return new RawResponse(body);
  }

  @Public()
  @Get('startup')
  @ApiOperation({ summary: 'Startup — schema migrated' })
  async startup(): Promise<RawResponse<Record<string, unknown>>> {
    try {
      const pending = await this.dataSource.showMigrations();
      if (pending) {
        throw new ServiceUnavailableException({
          status: 'migrations_pending',
          message: 'Database schema is behind the application',
        });
      }
      return new RawResponse({ status: 'ok', migrations: 'up-to-date' });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        status: 'error',
        message: error instanceof Error ? error.message : 'Migration check failed',
      });
    }
  }

  private async checkMysql(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG'
        ? { status: 'up', latencyMs: Date.now() - started }
        : { status: 'down', error: `unexpected ping reply: ${pong}` };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkMongo(): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      if (this.mongo.readyState !== 1) return { status: 'down', error: 'not connected' };
      await this.mongo.db?.admin().ping();
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }
}
