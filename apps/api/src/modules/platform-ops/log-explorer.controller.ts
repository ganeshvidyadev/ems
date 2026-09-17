import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Connection } from 'mongoose';
import { DataSource } from 'typeorm';
import { Permissions } from '../../common/decorators';
import type { LogCollection } from '../logging/log-buffer.service';
import { TenantEntity } from '../../database/entities/tenant.entity';

const BROWSABLE_COLLECTIONS: readonly LogCollection[] = [
  'api_logs',
  'error_logs',
  'auth_logs',
  'activity_logs',
  'webhook_logs',
  'job_logs',
  'third_party_logs',
  'storefront_events',
  'search_queries',
];

/**
 * Platform log explorer — a thin, generic reader over the Mongo collections
 * `LogBufferService` writes to. The collection name is validated against an
 * allowlist rather than passed straight through: an arbitrary string reaching
 * `db.collection(name)` would let a caller address any collection in the
 * database, not just the log ones this endpoint is meant to expose.
 */
@ApiTags('platform-ops')
@Controller({ version: '1' })
export class LogExplorerController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('platform/logs/:collection')
  @Permissions('platform.log:read')
  @ApiOperation({ summary: 'Browse one log collection, newest first, optionally filtered by tenant or search' })
  async browse(
    @Param('collection') collection: string,
    @Query('tenantId') tenantId?: string,
    @Query('q') q?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{ collection: string; count: number; documents: Record<string, unknown>[] }> {
    if (!BROWSABLE_COLLECTIONS.includes(collection as LogCollection)) {
      throw new NotFoundException(`Unknown log collection '${collection}'`);
    }

    const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 200);
    const filter: Record<string, unknown> = {};

    if (tenantId && tenantId.trim() !== '') {
      const trimmed = tenantId.trim();
      let resolvedNumericId: number | null = null;

      // Check if it's already numeric
      if (/^\d+$/.test(trimmed)) {
        resolvedNumericId = Number(trimmed);
      } else {
        // Resolve from publicId or slug
        const tenant = await this.dataSource.getRepository(TenantEntity).findOne({
          where: [{ publicId: trimmed }, { slug: trimmed }],
        });
        if (tenant) {
          resolvedNumericId = Number(tenant.id);
        } else {
          // No such tenant exists, return empty result directly
          return { collection, count: 0, documents: [] };
        }
      }

      if (resolvedNumericId !== null) {
        filter['tenantId'] = resolvedNumericId;
      }
    }

    if (q && q.trim() !== '') {
      const term = q.trim();
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter['$or'] = [
        { message: regex },
        { path: regex },
        { action: regex },
        { event: regex },
        { error: regex },
        { errorMessage: regex },
        { 'error.message': regex },
        { identifier: regex },
        { ip: regex },
        { userAgent: regex },
      ];
    }

    const documents = await this.connection
      .collection(collection)
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();

    return { collection, count: documents.length, documents };
  }
}

