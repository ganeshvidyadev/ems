import { Module } from '@nestjs/common';
import { LogExplorerController } from './log-explorer.controller';
import { QueueAdminController } from './queue-admin.controller';

@Module({
  controllers: [LogExplorerController, QueueAdminController],
})
export class PlatformOpsModule {}
