import { Module } from '@nestjs/common';
import { ThemeController } from './theme.controller';
import { ThemeTemplateRepository } from './theme-template.repository';
import { TenantThemeRepository } from './tenant-theme.repository';
import { ThemeService } from './theme.service';
import { ThemeAccessService } from './theme-access.service';
import { ThemeAccessController } from './theme-access.controller';

@Module({
  controllers: [ThemeController, ThemeAccessController],
  providers: [ThemeTemplateRepository, TenantThemeRepository, ThemeService, ThemeAccessService],
  exports: [ThemeService],
})
export class ThemeModule {}
