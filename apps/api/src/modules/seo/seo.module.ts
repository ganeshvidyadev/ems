import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoSettingsRepository } from './seo-settings.repository';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoController],
  providers: [SeoSettingsRepository, SeoService],
  exports: [SeoService],
})
export class SeoModule {}
