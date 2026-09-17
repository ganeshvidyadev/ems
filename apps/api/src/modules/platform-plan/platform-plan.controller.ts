import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createPlanRequestSchema,
  updatePlanRequestSchema,
  type CreatePlanRequest,
  type UpdatePlanRequest,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { PlatformPlanService } from './platform-plan.service';

@ApiTags('platform-plans')
@Controller({ path: 'platform/plans', version: '1' })
export class PlatformPlanController {
  constructor(private readonly plans: PlatformPlanService) {}

  @Get()
  @Permissions('platform.plan:read')
  @ApiOperation({ summary: 'Every plan, public and negotiated, active and archived' })
  list() {
    return this.plans.list();
  }

  @Get(':code')
  @Permissions('platform.plan:read')
  @ApiOperation({ summary: 'Get one plan' })
  get(@Param('code') code: string) {
    return this.plans.get(code);
  }

  @Post()
  @Permissions('platform.plan:create')
  @Validate(createPlanRequestSchema)
  @ApiOperation({ summary: 'Add a plan to the catalogue' })
  create(@Body() body: CreatePlanRequest) {
    return this.plans.create(body);
  }

  @Put(':code')
  @Permissions('platform.plan:update')
  @Validate(updatePlanRequestSchema)
  @ApiOperation({ summary: 'Update a plan — price, limits, features, or public/negotiated visibility' })
  update(@Param('code') code: string, @Body() body: UpdatePlanRequest) {
    return this.plans.update(code, body);
  }

  @Post(':code/archive')
  @Permissions('platform.plan:update')
  @ApiOperation({ summary: 'Archive a plan — existing subscribers keep it, no one new can start on it' })
  archive(@Param('code') code: string) {
    return this.plans.archive(code);
  }

  @Delete(':code')
  @Permissions('platform.plan:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a plan with no subscribers' })
  async remove(@Param('code') code: string): Promise<void> {
    await this.plans.remove(code);
  }
}
