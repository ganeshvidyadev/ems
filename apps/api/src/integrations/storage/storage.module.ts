import { Global, Module } from '@nestjs/common';
import { S3StorageAdapter } from './s3/s3.adapter';
import { STORAGE_PORT } from './storage.port';

/**
 * Object storage, behind `StoragePort`.
 *
 * Only one adapter exists today (S3-compatible — MinIO/AWS), so this is thinner than
 * `PaymentModule`'s factory-over-many-adapters shape. `@Global()` so `MediaModule` and
 * `ProductModule`'s import/export services can both inject `STORAGE_PORT` without each
 * re-importing this module.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE_PORT, useClass: S3StorageAdapter }],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
