import { Module } from '@nestjs/common';
import { PlatformWebsiteController } from './platform-website.controller';
import { WebsitePublicController } from './website-public.controller';
import { PlatformWebsiteService } from './platform-website.service';

@Module({
  controllers: [PlatformWebsiteController, WebsitePublicController],
  providers: [PlatformWebsiteService],
  exports: [PlatformWebsiteService],
})
export class PlatformWebsiteModule {}
