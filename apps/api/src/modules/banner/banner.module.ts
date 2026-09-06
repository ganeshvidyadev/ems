import { Module } from '@nestjs/common';
import { BannerController } from './banner.controller';
import { BannerRepository } from './banner.repository';
import { BannerService } from './banner.service';

@Module({
  controllers: [BannerController],
  providers: [BannerRepository, BannerService],
  exports: [BannerService],
})
export class BannerModule {}
