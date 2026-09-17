import { Module } from '@nestjs/common';
import { PlatformSearchController } from './platform-search.controller';
import { PlatformSearchService } from './platform-search.service';

@Module({
  controllers: [PlatformSearchController],
  providers: [PlatformSearchService],
})
export class PlatformSearchModule {}
