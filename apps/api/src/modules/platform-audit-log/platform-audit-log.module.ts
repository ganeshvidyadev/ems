import { Module } from '@nestjs/common';
import { PlatformAuditLogController } from './platform-audit-log.controller';
import { PlatformAuditLogService } from './platform-audit-log.service';

@Module({
  controllers: [PlatformAuditLogController],
  providers: [PlatformAuditLogService],
})
export class PlatformAuditLogModule {}
