import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMenuItemRequestSchema,
  createMenuRequestSchema,
  reorderMenuItemsRequestSchema,
  updateMenuItemRequestSchema,
} from '@ems/contracts';
import { Permissions, Public, Validate } from '../../common/decorators';
import { MenuService } from './menu.service';

@ApiTags('menus')
@Controller({ version: '1' })
export class MenuController {
  constructor(private readonly menus: MenuService) {}

  @Post('console/menus')
  @Permissions('menu:create')
  @Validate(createMenuRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create (or fetch) a named menu — e.g. header, footer-1, mobile' })
  async getOrCreate(@Body() body: ReturnType<typeof createMenuRequestSchema.parse>) {
    const menu = await this.menus.getOrCreate(body.storeId, body.code, body.name);
    return this.menus.toResponse(menu);
  }

  @Get('console/menus/:code')
  @Permissions('menu:read')
  @ApiOperation({ summary: 'Get a menu and its item tree' })
  async get(@Param('code') code: string, @Query('storeId') storeId: string) {
    return this.menus.toResponse(await this.menus.getByCode(storeId, code));
  }

  @Post('console/menus/:code/items')
  @Permissions('menu:update')
  @Validate(createMenuItemRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an item to a menu' })
  async addItem(
    @Param('code') code: string,
    @Query('storeId') storeId: string,
    @Body() body: ReturnType<typeof createMenuItemRequestSchema.parse>,
  ) {
    const menu = await this.menus.getByCode(storeId, code);
    await this.menus.addItem(menu.id, body);
    return this.menus.toResponse(menu);
  }

  @Put('console/menus/items/:itemId')
  @Permissions('menu:update')
  @Validate(updateMenuItemRequestSchema)
  @ApiOperation({ summary: 'Update a menu item' })
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() body: ReturnType<typeof updateMenuItemRequestSchema.parse>,
  ) {
    const item = await this.menus.updateItem(itemId, body);
    return {
      id: item.id,
      parentId: item.parentId,
      label: item.label,
      linkType: item.linkType,
      linkTarget: item.linkTarget,
      icon: item.icon,
      openInNewTab: item.openInNewTab,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    };
  }

  @Delete('console/menus/items/:itemId')
  @Permissions('menu:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a menu item' })
  async removeItem(@Param('itemId') itemId: string): Promise<void> {
    await this.menus.removeItem(itemId);
  }

  @Post('console/menus/:code/reorder')
  @Permissions('menu:update')
  @Validate(reorderMenuItemsRequestSchema)
  @ApiOperation({ summary: 'Reorder items under one parent (or the root)' })
  async reorder(
    @Param('code') code: string,
    @Query('storeId') storeId: string,
    @Body() body: ReturnType<typeof reorderMenuItemsRequestSchema.parse>,
  ) {
    const menu = await this.menus.getByCode(storeId, code);
    await this.menus.reorder(menu.id, body.parentId, body.orderedIds);
    return this.menus.toResponse(menu);
  }

  @Get('storefront/menus/:code')
  @Public()
  @ApiOperation({ summary: 'Get a menu for storefront rendering (header/footer/mobile)' })
  async storefrontGet(@Param('code') code: string, @Query('storeId') storeId: string) {
    return this.menus.toResponse(await this.menus.getByCode(storeId, code));
  }
}
