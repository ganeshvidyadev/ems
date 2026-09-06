import { Module } from '@nestjs/common';
import { TenantExportController } from './tenant-export.controller';
import { TenantExportService } from './tenant-export.service';

@Module({
  controllers: [TenantExportController],
  providers: [TenantExportService],
})
export class TenantExportModule {}
