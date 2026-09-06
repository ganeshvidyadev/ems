import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createBannerRequestSchema, reorderBannersRequestSchema, updateBannerRequestSchema } from '@ems/contracts';
import { Permissions, Public, Validate } from '../../common/decorators';
import { BannerService } from './banner.service';

@ApiTags('banners')
@Controller({ version: '1' })
export class BannerController {
  constructor(private readonly banners: BannerService) {}

  @Get('console/banners')
  @Permissions('banner:read')
  @ApiOperation({ summary: 'List banners for a placement' })
  async list(@Query('storeId') storeId: string, @Query('placement') placement: string) {
    const rows = await this.banners.listByPlacement(storeId, placement as never);
    return Promise.all(rows.map((b) => this.banners.toResponse(b)));
  }

  @Post('console/banners')
  @Permissions('banner:create')
  @Validate(createBannerRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a banner' })
  async create(@Body() body: ReturnType<typeof createBannerRequestSchema.parse>) {
    return this.banners.toResponse(await this.banners.create(body));
  }

  @Put('console/banners/:id')
  @Permissions('banner:update')
  @Validate(updateBannerRequestSchema)
  @ApiOperation({ summary: 'Update a banner' })
  async update(@Param('id') id: string, @Body() body: ReturnType<typeof updateBannerRequestSchema.parse>) {
    return this.banners.toResponse(await this.banners.update(id, body));
  }

  @Post('console/banners/reorder')
  @Permissions('banner:update')
  @Validate(reorderBannersRequestSchema)
  @ApiOperation({ summary: 'Reorder banners within one placement' })
  async reorder(@Body() body: ReturnType<typeof reorderBannersRequestSchema.parse>) {
    await this.banners.reorder(body.placement, body.orderedIds);
    return { message: 'Reordered.' };
  }

  @Delete('console/banners/:id')
  @Permissions('banner:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a banner' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.banners.remove(id);
  }

  @Get('storefront/banners')
  @Public()
  @ApiOperation({ summary: 'Currently-live banners for a placement (scheduling window applied)' })
  async storefrontList(@Query('storeId') storeId: string, @Query('placement') placement: string) {
    const rows = await this.banners.listByPlacement(storeId, placement as never, true);
    return Promise.all(rows.map((b) => this.banners.toResponse(b)));
  }

  @Post('storefront/banners/:id/click')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record a banner click' })
  async recordClick(@Param('id') id: string): Promise<void> {
    await this.banners.recordClick(id);
  }
}
