import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createThemeTemplateRequestSchema,
  updateThemeTemplateRequestSchema,
  type CreateThemeTemplateRequest,
  type UpdateThemeTemplateRequest,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { PlatformThemeTemplateService } from './platform-theme-template.service';

@ApiTags('platform-theme-templates')
@Controller({ path: 'platform/theme-templates', version: '1' })
export class PlatformThemeTemplateController {
  constructor(private readonly templates: PlatformThemeTemplateService) {}

  @Get()
  @Permissions('platform.template:read')
  @ApiOperation({ summary: 'Every theme template, active and archived' })
  list() {
    return this.templates.list();
  }

  @Get(':code')
  @Permissions('platform.template:read')
  @ApiOperation({ summary: 'Get one theme template' })
  get(@Param('code') code: string) {
    return this.templates.get(code);
  }

  @Post()
  @Permissions('platform.template:create')
  @Validate(createThemeTemplateRequestSchema)
  @ApiOperation({ summary: 'Add a template to the gallery' })
  create(@Body() body: CreateThemeTemplateRequest) {
    return this.templates.create(body);
  }

  @Put(':code')
  @Permissions('platform.template:update')
  @Validate(updateThemeTemplateRequestSchema)
  @ApiOperation({ summary: "Update a template's gallery listing or its default config for future selections" })
  update(@Param('code') code: string, @Body() body: UpdateThemeTemplateRequest) {
    return this.templates.update(code, body);
  }

  @Post(':code/archive')
  @Permissions('platform.template:update')
  @ApiOperation({ summary: 'Archive a template — existing stores keep it, no one new can select it' })
  archive(@Param('code') code: string) {
    return this.templates.archive(code);
  }

  @Delete(':code')
  @Permissions('platform.template:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template no store has ever selected' })
  async remove(@Param('code') code: string): Promise<void> {
    await this.templates.remove(code);
  }
}
