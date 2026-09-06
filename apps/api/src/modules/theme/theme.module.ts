import { Module } from '@nestjs/common';
import { ThemeController } from './theme.controller';
import { ThemeTemplateRepository } from './theme-template.repository';
import { TenantThemeRepository } from './tenant-theme.repository';
import { ThemeService } from './theme.service';

@Module({
  controllers: [ThemeController],
  providers: [ThemeTemplateRepository, TenantThemeRepository, ThemeService],
  exports: [ThemeService],
})
export class ThemeModule {}
