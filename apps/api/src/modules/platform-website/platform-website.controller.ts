import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateWebsiteContentRequestSchema, type UpdateWebsiteContentRequest } from '@ems/contracts';
import { CurrentUser, Permissions, Validate } from '../../common/decorators';
import { PlatformWebsiteService } from './platform-website.service';

@ApiTags('platform-website')
@Controller({ path: 'platform/website', version: '1' })
export class PlatformWebsiteController {
  constructor(private readonly website: PlatformWebsiteService) {}

  @Get()
  @Permissions('platform.website:read')
  @ApiOperation({ summary: 'Public marketing website content, for editing' })
  get() {
    return this.website.getAll();
  }

  @Put()
  @Permissions('platform.website:update')
  @Validate(updateWebsiteContentRequestSchema)
  @ApiOperation({ summary: 'Update public marketing website content' })
  update(@Body() body: UpdateWebsiteContentRequest, @CurrentUser('id') actorId: string) {
    return this.website.update(body, actorId);
  }
}
