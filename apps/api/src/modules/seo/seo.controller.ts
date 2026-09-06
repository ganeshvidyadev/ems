import { Body, Controller, Get, Header, Put, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { storeSeoSettingsSchema } from '@ems/contracts';
import { Permissions, Public, Validate } from '../../common/decorators';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { SeoService } from './seo.service';

@ApiTags('seo')
@Controller({ version: '1' })
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('console/seo/settings')
  @Permissions('seo:read')
  @ApiOperation({ summary: "A store's SEO settings (defaults, GA4, Search Console verification)" })
  async getSettings(@Query('storeId') storeId: string) {
    return this.seo.getSettings(storeId);
  }

  @Put('console/seo/settings')
  @Permissions('seo:update')
  @Validate(storeSeoSettingsSchema)
  @ApiOperation({ summary: "Update a store's SEO settings" })
  async updateSettings(
    @Query('storeId') storeId: string,
    @Body() body: ReturnType<typeof storeSeoSettingsSchema.parse>,
  ) {
    return this.seo.updateSettings(storeId, body);
  }

  @Get('storefront/sitemap.xml')
  @Public()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiExcludeEndpoint()
  async sitemap(@Query('storeId') storeId: string): Promise<RawResponse<string>> {
    return new RawResponse(await this.seo.generateSitemap(storeId));
  }

  @Get('storefront/robots.txt')
  @Public()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiExcludeEndpoint()
  async robots(@Query('storeId') storeId: string): Promise<RawResponse<string>> {
    return new RawResponse(await this.seo.generateRobotsTxt(storeId));
  }
}
