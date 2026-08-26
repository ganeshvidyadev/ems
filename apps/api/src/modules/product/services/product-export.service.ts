import { Inject, Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import type { ProductExportRequest, ProductExportResponse } from '@ems/contracts';
import { PRODUCT_IMPORT_COLUMNS } from '@ems/contracts';
import { RequestContextService } from '../../../common/services/request-context.service';
import { STORAGE_PORT, type StoragePort } from '../../../integrations/storage/storage.port';
import { JobRepository } from '../../job/job.repository';
import { ProductRepository } from '../product.repository';

const MAX_EXPORT_ROWS = 50_000;

@Injectable()
export class ProductExportService {
  constructor(
    private readonly products: ProductRepository,
    private readonly jobs: JobRepository,
    private readonly context: RequestContextService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /**
   * Synchronous by design — unlike import, there is no per-row error report to accumulate,
   * so there is nothing a background job buys beyond what the request/response cycle
   * already gives the caller. Still recorded as a `JobRunEntity` row for the same
   * audit trail import gets.
   */
  async export(input: ProductExportRequest): Promise<ProductExportResponse> {
    const tenantId = this.context.requireTenantId('export products');

    const storeId = input.storeId ? (await this.products.resolveId('stores', input.storeId)) ?? undefined : undefined;
    const categoryId = input.categoryId
      ? (await this.products.resolveId('categories', input.categoryId)) ?? undefined
      : undefined;

    const { items, total } = await this.products.listing(
      { storeId, status: input.status, categoryId },
      [{ field: 'createdAt', direction: 'ASC' }],
      0,
      MAX_EXPORT_ROWS,
    );

    const rows = items.map((product) => [
      product.sku ?? '',
      product.name,
      product.type,
      product.status,
      product.visibility,
      product.priceMinor,
      product.comparePriceMinor ?? '',
      product.currency,
      '', // brandSlug — resolved separately would cost one query per row; left blank for now
      '', // categorySlug — same
      product.shortDescription ?? '',
      product.barcode ?? '',
      product.hsnCode ?? '',
      product.trackInventory ? 'true' : 'false',
    ]);

    const key = `tenants/${tenantId}/exports/${Date.now()}-products.${input.format.toLowerCase()}`;
    const buffer = input.format === 'CSV' ? this.buildCsv(rows) : await this.buildXlsx(rows);
    const contentType = input.format === 'CSV' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    await this.storage.putObject(key, buffer, contentType);
    const downloadUrl = await this.storage.presignDownload(key, 3_600);

    const job = await this.jobs.insert({
      jobType: 'product_export',
      status: 'COMPLETED',
      totalRows: total,
      processedRows: total,
      successRows: total,
      failedRows: 0,
      outputUrl: downloadUrl,
      requestedBy: this.context.userId ?? null,
      startedAt: new Date(),
      finishedAt: new Date(),
      correlationId: this.context.correlationId ?? null,
    });

    return { jobId: String(job.id), downloadUrl, rowCount: total };
  }

  private buildCsv(rows: string[][]): Buffer {
    const csv = stringify([[...PRODUCT_IMPORT_COLUMNS], ...rows]);
    return Buffer.from(csv, 'utf-8');
  }

  private async buildXlsx(rows: string[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow([...PRODUCT_IMPORT_COLUMNS]);
    for (const row of rows) sheet.addRow(row);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
