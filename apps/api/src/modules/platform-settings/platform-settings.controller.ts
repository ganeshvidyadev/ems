import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { updatePlatformSettingsRequestSchema, type UpdatePlatformSettingsRequest } from '@ems/contracts';
import { CurrentUser, Permissions, Validate } from '../../common/decorators';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('platform-settings')
@Controller({ path: 'platform/settings', version: '1' })
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @Permissions('platform.settings:read')
  @ApiOperation({ summary: 'Platform-wide configuration' })
  get() {
    return this.settings.getAll();
  }

  @Put()
  @Permissions('platform.settings:update')
  @Validate(updatePlatformSettingsRequestSchema)
  @ApiOperation({ summary: 'Update platform-wide configuration' })
  update(@Body() body: UpdatePlatformSettingsRequest, @CurrentUser('id') actorId: string) {
    return this.settings.update(body, actorId);
  }
}
