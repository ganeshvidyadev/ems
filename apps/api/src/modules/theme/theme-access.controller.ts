import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Permissions, PlatformOnly, Public, Validate } from '../../common/decorators';
import { ThemeAccessService } from './theme-access.service';

const code = z.enum(['default', 'organic', 'famms', 'circuit', 'harvest']);
export const themeAccessSchema = z
  .object({
    selectedTheme: code,
    allowedThemes: z.array(code).max(5),
  })
  .strict();

export const themeCustomizationSchema = z
  .object({
    isCustomized: z.boolean().default(false),
    customizationFeeINR: z.number().nonnegative().default(0),
    customizationStatus: z.enum(['STANDARD_FREE', 'MODIFIED_PAID', 'BESPOKE_CUSTOM']).default('STANDARD_FREE'),
    notes: z.string().max(1000).optional(),
    customCss: z.string().max(50000).optional(),
  })
  .strict();

export const brandingSchema = z
  .object({
    logoUrl: z.string().max(1000).nullable().optional(),
    faviconUrl: z.string().max(1000).nullable().optional(),
    banners: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string().max(255).nullable().optional(),
          subtitle: z.string().max(500).nullable().optional(),
          imageUrl: z.string().max(1000).nullable().optional(),
          mobileImageUrl: z.string().max(1000).nullable().optional(),
          linkUrl: z.string().max(1000).nullable().optional(),
          ctaLabel: z.string().max(64).nullable().optional(),
          badgeTag: z.string().max(64).nullable().optional(),
          isActive: z.boolean().default(true),
        }),
      )
      .optional(),
  })
  .strict();

export const assetUploadSchema = z
  .object({
    assetType: z.enum(['logo', 'favicon', 'banner', 'general']),
    fileName: z.string().min(1).max(255),
    fileData: z.string().min(1),
  })
  .strict();

@Controller({ version: '1' })
export class ThemeAccessController {
  constructor(private readonly access: ThemeAccessService) {}

  @Get('platform/themes')
  @PlatformOnly()
  @Permissions('platform.tenant:read')
  list() {
    return this.access.list();
  }

  @Put('platform/themes/:companyId')
  @PlatformOnly()
  @Permissions('platform.tenant:update')
  @Validate(themeAccessSchema)
  update(@Param('companyId') id: string, @Body() body: z.infer<typeof themeAccessSchema>) {
    return this.access.update(id, body);
  }

  @Post('platform/themes/:companyId/provision-workspace')
  @PlatformOnly()
  @Permissions('platform.tenant:update')
  provisionWorkspace(@Param('companyId') id: string, @Body() body?: { themeCode?: string }) {
    return this.access.provisionWorkspace(id, body?.themeCode);
  }

  @Put('platform/themes/:companyId/customization')
  @PlatformOnly()
  @Permissions('platform.tenant:update')
  @Validate(themeCustomizationSchema)
  updateCustomization(@Param('companyId') id: string, @Body() body: z.infer<typeof themeCustomizationSchema>) {
    return this.access.updateCustomization(id, body);
  }

  @Get('platform/themes/:companyId/branding')
  @PlatformOnly()
  @Permissions('platform.tenant:read')
  getBranding(@Param('companyId') id: string) {
    return this.access.getBranding(id);
  }

  @Put('platform/themes/:companyId/branding')
  @PlatformOnly()
  @Permissions('platform.tenant:update')
  @Validate(brandingSchema)
  updateBranding(@Param('companyId') id: string, @Body() body: z.infer<typeof brandingSchema>) {
    return this.access.updateBranding(id, body);
  }

  @Post('platform/themes/:companyId/assets/upload')
  @PlatformOnly()
  @Permissions('platform.tenant:update')
  @Validate(assetUploadSchema)
  uploadAsset(@Param('companyId') id: string, @Body() body: z.infer<typeof assetUploadSchema>) {
    return this.access.uploadAsset(id, body);
  }

  @Get('storefront/theme-assignment')
  @Public()
  current() {
    return this.access.current();
  }
}
