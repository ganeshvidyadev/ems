import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createPlatformUserRequestSchema,
  updatePlatformUserRequestSchema,
  type CreatePlatformUserRequest,
  type UpdatePlatformUserRequest,
} from '@ems/contracts';
import { CurrentUser, Permissions, Validate } from '../../common/decorators';
import { PlatformUserService } from './platform-user.service';

@ApiTags('platform-users')
@Controller({ path: 'platform/users', version: '1' })
export class PlatformUserController {
  constructor(private readonly users: PlatformUserService) {}

  @Get()
  @Permissions('platform.user:read')
  @ApiOperation({ summary: 'Every platform staff account' })
  list(@CurrentUser('id') actorId: string) {
    return this.users.list(actorId);
  }

  @Get(':id')
  @Permissions('platform.user:read')
  @ApiOperation({ summary: 'Get one platform staff account' })
  get(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.users.get(id, actorId);
  }

  @Post()
  @Permissions('platform.user:create')
  @Validate(createPlatformUserRequestSchema)
  @ApiOperation({ summary: 'Create a platform staff account with an initial password and role set' })
  create(@Body() body: CreatePlatformUserRequest, @CurrentUser('id') actorId: string) {
    return this.users.create(body, actorId);
  }

  @Put(':id')
  @Permissions('platform.user:update')
  @Validate(updatePlatformUserRequestSchema)
  @ApiOperation({ summary: "Update a platform staff account's name or role set" })
  update(@Param('id') id: string, @Body() body: UpdatePlatformUserRequest, @CurrentUser('id') actorId: string) {
    return this.users.update(id, body, actorId);
  }

  @Post(':id/suspend')
  @Permissions('platform.user:suspend')
  @ApiOperation({ summary: 'Suspend a platform staff account' })
  suspend(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.users.suspend(id, actorId);
  }

  @Post(':id/reactivate')
  @Permissions('platform.user:update')
  @ApiOperation({ summary: 'Reactivate a suspended platform staff account' })
  reactivate(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.users.reactivate(id, actorId);
  }

  @Delete(':id')
  @Permissions('platform.user:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a platform staff account' })
  async remove(@Param('id') id: string, @CurrentUser('id') actorId: string): Promise<void> {
    await this.users.remove(id, actorId);
  }
}
