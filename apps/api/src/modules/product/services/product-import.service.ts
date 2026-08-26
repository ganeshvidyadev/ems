import { Injectable } from '@nestjs/common';
import type { ProductImportRequest } from '@ems/contracts';
import { NotFoundError } from '@ems/kernel';
import { RequestContextService } from '../../../common/services/request-context.service';
import { JobRepository } from '../../job/job.repository';
import { QueueName } from '../../../queues/queue-names.enum';
import { QueueRegistry } from '../../../queues/queue.registry';
import { ProductRepository } from '../product.repository';

export interface ProductImportJobData {
  tenantId: string;
  jobId: string;
  storeId: string;
  storageKey: string;
  format: 'CSV' | 'XLSX';
  correlationId?: string | null;
}

@Injectable()
export class ProductImportService {
  constructor(
    private readonly products: ProductRepository,
    private readonly jobs: JobRepository,
    private readonly queues: QueueRegistry,
    private readonly context: RequestContextService,
  ) {}

  async start(input: ProductImportRequest) {
    const tenantId = this.context.requireTenantId('start product import');

    const storeId = await this.products.resolveId('stores', input.storeId);
    if (!storeId) throw new NotFoundError('Store', input.storeId);

    const job = await this.jobs.insert({
      jobType: 'product_import',
      status: 'QUEUED',
      inputParams: { storageKey: input.storageKey, format: input.format, storeId: input.storeId },
      requestedBy: this.context.userId ?? null,
      correlationId: this.context.correlationId ?? null,
    });

    await this.queues.get(QueueName.IMPORT_EXPORT).add('product-import', {
      tenantId,
      jobId: job.id,
      storeId,
      storageKey: input.storageKey,
      format: input.format,
      correlationId: this.context.correlationId ?? null,
    } satisfies ProductImportJobData);

    return job;
  }
}
