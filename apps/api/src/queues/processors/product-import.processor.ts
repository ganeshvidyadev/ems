import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import type { EntityManager } from 'typeorm';
import {
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  PRODUCT_VISIBILITIES,
  type ProductStatus,
  type ProductType,
  type ProductVisibility,
} from '@ems/contracts';
import { ValidationError, uniqueSlug } from '@ems/kernel';
import { REDIS_QUEUE_CLIENT } from '../../common/redis/redis.module';
import { RequestContextService } from '../../common/services/request-context.service';
import { STORAGE_PORT, type StoragePort } from '../../integrations/storage/storage.port';
import { JobRunEntity } from '../../database/entities';
import { ProductRepository } from '../../modules/product/product.repository';
import { ProductEvent } from '../../modules/product/events/product-events';
import type { ProductImportJobData } from '../../modules/product/services/product-import.service';
import { QueueName, QUEUE_SETTINGS } from '../queue-names.enum';

const CHUNK_SIZE = 500;

interface RowError {
  row: number;
  sku: string;
  errors: string;
}

/**
 * Streams a CSV/XLSX import in chunks and upserts by SKU. Bypasses `ProductService`
 * deliberately: the import row already carries internal ids resolved from slugs
 * (brand/category), so routing back through the public-id-facing create/update path
 * would mean resolving those ids to public ids just to have the service resolve them
 * straight back — this writes the row once, directly, with its own slug generation and
 * outbox emission mirroring what the service does for the HTTP path.
 */
@Injectable()
export class ProductImportProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProductImportProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_QUEUE_CLIENT) private readonly connection: Redis,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
    private readonly productRepo: ProductRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.EMS_ROLE !== 'worker') return;

    const settings = QUEUE_SETTINGS[QueueName.IMPORT_EXPORT];
    this.worker = new Worker(
      QueueName.IMPORT_EXPORT,
      async (job) => this.handle(job),
      { connection: this.connection, concurrency: settings.concurrency },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Import job ${job?.id ?? '?'} failed: ${error.message}`);
    });

    this.logger.log(`Import/export worker listening (concurrency ${settings.concurrency})`);
  }

  private async handle(job: Job<ProductImportJobData>): Promise<void> {
    if (job.name !== 'product-import') return;

    const { tenantId, jobId, storeId, storageKey, format } = job.data;

    await this.context.run(
      {
        correlationId: job.data.correlationId ?? `import-${job.id}`,
        tenantId,
        surface: 'system',
        startedAt: Date.now(),
      },
      async () => {
        const jobRepo = this.manager.getRepository(JobRunEntity);
        const jobRun = await jobRepo.findOne({ where: { id: jobId, tenantId } });
        if (!jobRun) return;

        jobRun.status = 'RUNNING';
        jobRun.startedAt = new Date();
        await jobRepo.save(jobRun);

        const buffer = await this.storage.getObject(storageKey);
        const records = format === 'CSV' ? this.parseCsv(buffer) : await this.parseXlsx(buffer);

        jobRun.totalRows = records.length;
        await jobRepo.save(jobRun);

        const errors: RowError[] = [];
        let success = 0;

        for (let start = 0; start < records.length; start += CHUNK_SIZE) {
          const chunk = records.slice(start, start + CHUNK_SIZE);

          for (const [offset, record] of chunk.entries()) {
            const rowNumber = start + offset + 2; // +1 header row, +1 for 1-indexing
            try {
              await this.upsertRow(storeId, record);
              success++;
            } catch (error) {
              errors.push({
                row: rowNumber,
                sku: record.sku ?? '',
                errors: error instanceof Error ? error.message : String(error),
              });
            }
          }

          jobRun.processedRows = Math.min(start + chunk.length, records.length);
          jobRun.successRows = success;
          jobRun.failedRows = errors.length;
          await jobRepo.save(jobRun);
        }

        jobRun.finishedAt = new Date();
        jobRun.status = errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';

        if (errors.length > 0) {
          const reportCsv = stringify([['row', 'sku', 'errors'], ...errors.map((e) => [e.row, e.sku, e.errors])]);
          const reportKey = `tenants/${tenantId}/imports/${jobId}-errors.csv`;
          await this.storage.putObject(reportKey, Buffer.from(reportCsv, 'utf-8'), 'text/csv');
          jobRun.errorReportUrl = await this.storage.presignDownload(reportKey, 86_400);
        }

        await jobRepo.save(jobRun);
      },
    );
  }

  private async upsertRow(storeId: string, record: Record<string, string>): Promise<void> {
    const name = record.name?.trim();
    if (!name) throw new ValidationError('name is required');

    const type = asEnum(record.type, PRODUCT_TYPES, 'SIMPLE') as ProductType;
    const status = asEnum(record.status, PRODUCT_STATUSES, 'DRAFT') as ProductStatus;
    const visibility = asEnum(record.visibility, PRODUCT_VISIBILITIES, 'VISIBLE') as ProductVisibility;
    const priceMinor = record.priceMinor && /^\d+$/.test(record.priceMinor) ? record.priceMinor : '0';

    const brandId = record.brandSlug ? await this.productRepo.resolveIdBySlug('brands', record.brandSlug) : null;
    const categoryId = record.categorySlug
      ? await this.productRepo.resolveIdBySlug('categories', record.categorySlug)
      : null;

    const existing = record.sku ? await this.productRepo.findBySku(record.sku) : null;

    const fields = {
      brandId,
      name,
      type,
      status,
      visibility,
      priceMinor,
      comparePriceMinor: record.comparePriceMinor && /^\d+$/.test(record.comparePriceMinor) ? record.comparePriceMinor : null,
      currency: record.currency || 'INR',
      shortDescription: record.shortDescription || null,
      barcode: record.barcode || null,
      hsnCode: record.hsnCode || null,
      trackInventory: record.trackInventory ? record.trackInventory.toLowerCase() === 'true' : true,
    };

    await this.productRepo.transaction(async (repo) => {
      if (existing) {
        Object.assign(existing, fields);
        await repo.save(existing);
        await repo.emitEvent({
          aggregateType: 'Product',
          aggregateId: existing.id,
          eventType: ProductEvent.UPDATED,
          payload: { productId: existing.publicId, source: 'bulk_import' },
        });
        if (categoryId) await repo.setCategoryLinks(existing.id, [categoryId], categoryId);
      } else {
        const slug = await uniqueSlug(name, (candidate) => repo.slugExists(candidate, storeId));
        const created = await repo.insert({
          storeId,
          ...fields,
          slug,
          sku: record.sku || null,
          taxClassId: null,
        });
        await repo.emitEvent({
          aggregateType: 'Product',
          aggregateId: created.id,
          eventType: ProductEvent.CREATED,
          payload: { productId: created.publicId, source: 'bulk_import' },
        });
        if (categoryId) await repo.setCategoryLinks(created.id, [categoryId], categoryId);
      }
    });
  }

  private parseCsv(buffer: Buffer): Record<string, string>[] {
    return parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  }

  private async parseXlsx(buffer: Buffer): Promise<Record<string, string>[]> {
    const workbook = new ExcelJS.Workbook();
    // exceljs's bundled types pin a non-generic `Buffer`; the workspace's `@types/node`
    // declares the newer generic `Buffer<ArrayBufferLike>`, so the two nominally diverge
    // even though they are structurally identical at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headerRow = sheet.getRow(1);
    const headers = (headerRow.values as (string | undefined)[]).slice(1).map((h) => h ?? '');

    const rows: Record<string, string>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = (row.values as (string | number | undefined)[]).slice(1);
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = values[index] !== undefined ? String(values[index]) : '';
      });
      rows.push(record);
    });
    return rows;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}

function asEnum<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  if (value && (allowed as readonly string[]).includes(value)) return value as T[number];
  return fallback;
}
