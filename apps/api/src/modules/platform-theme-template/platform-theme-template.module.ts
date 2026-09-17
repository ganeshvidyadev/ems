import { Module } from '@nestjs/common';
import { PlatformThemeTemplateController } from './platform-theme-template.controller';
import { PlatformThemeTemplateService } from './platform-theme-template.service';

@Module({
  controllers: [PlatformThemeTemplateController],
  providers: [PlatformThemeTemplateService],
})
export class PlatformThemeTemplateModule {}
