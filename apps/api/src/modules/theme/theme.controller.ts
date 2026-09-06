import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cloneThemeRequestSchema,
  updateThemeConfigRequestSchema,
  updateThemeCustomCodeRequestSchema,
} from '@ems/contracts';
import { NotFoundError } from '@ems/kernel';
import { Permissions, Public, Validate } from '../../common/decorators';
import { ThemeService } from './theme.service';

@ApiTags('theme')
@Controller({ version: '1' })
export class ThemeController {
  constructor(private readonly themes: ThemeService) {}

  @Get('console/theme/gallery')
  @Permissions('theme:read')
  @ApiOperation({ summary: 'The nine-template gallery, marking which are locked by plan' })
  async gallery() {
    return this.themes.listGallery();
  }

  @Get('console/theme/store/:storeId')
  @Permissions('theme:read')
  @ApiOperation({ summary: "A store's themes (its current draft/published/archived copies)" })
  async listForStore(@Param('storeId') storeId: string) {
    const themes = await this.themes.listForStore(storeId);
    return Promise.all(themes.map((t) => this.themes.toResponse(t)));
  }

  @Post('console/theme/clone')
  @Permissions('theme:update')
  @Validate(cloneThemeRequestSchema)
  @ApiOperation({ summary: 'Clone a template into a new draft theme for a store' })
  async clone(@Body() body: ReturnType<typeof cloneThemeRequestSchema.parse>) {
    const theme = await this.themes.clone(body.storeId, body.templateCode, body.name);
    return this.themes.toResponse(theme);
  }

  @Get('console/theme/:id')
  @Permissions('theme:read')
  @ApiOperation({ summary: 'Get one theme (draft or published)' })
  async get(@Param('id') id: string) {
    return this.themes.toResponse(await this.themes.getByPublicId(id));
  }

  @Put('console/theme/:id/config')
  @Permissions('theme:update')
  @Validate(updateThemeConfigRequestSchema)
  @ApiOperation({ summary: "Edit a draft's colors, typography and homepage sections" })
  async updateConfig(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateThemeConfigRequestSchema.parse>,
  ) {
    return this.themes.toResponse(await this.themes.updateConfig(id, body));
  }

  @Put('console/theme/:id/custom-code')
  @Permissions('theme:update')
  @Validate(updateThemeCustomCodeRequestSchema)
  @ApiOperation({ summary: "Edit a draft's custom CSS / head HTML (sanitized on write)" })
  async updateCustomCode(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateThemeCustomCodeRequestSchema.parse>,
  ) {
    return this.themes.toResponse(await this.themes.updateCustomCode(id, body));
  }

  @Post('console/theme/:id/publish')
  @Permissions('theme:publish')
  @ApiOperation({ summary: 'Publish a draft — live to shoppers immediately' })
  async publish(@Param('id') id: string) {
    return this.themes.toResponse(await this.themes.publish(id));
  }

  @Get('console/theme/:id/preview')
  @Permissions('theme:preview')
  @ApiOperation({ summary: "A draft's config, for the console's live-preview pane" })
  async preview(@Param('id') id: string) {
    const theme = await this.themes.getByPublicId(id);
    return { config: theme.config, customCss: theme.customCss, customHeadHtml: theme.customHeadHtml };
  }

  @Get('storefront/theme')
  @Public()
  @ApiOperation({ summary: 'The published theme a store actually renders' })
  async live(@Query('storeId') storeId: string) {
    const live = await this.themes.getLive(storeId);
    if (!live) throw new NotFoundError('Published theme for this store');
    return live;
  }
}
