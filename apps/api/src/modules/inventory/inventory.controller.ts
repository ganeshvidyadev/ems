import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adjustInventoryRequestSchema,
  buildPaginationMeta,
  inventoryMovementListQuerySchema,
  transferInventoryRequestSchema,
  upsertInventorySettingsRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller({ path: 'console/inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('levels')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Stock levels for one product across every warehouse' })
  async levels(@Query('productId') productId: string, @Query('variantId') variantId?: string) {
    return this.inventory.listForProduct(productId, variantId ?? null);
  }

  @Get('low-stock')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Slots at or below their reorder point' })
  async lowStock() {
    return this.inventory.listLowStock();
  }

  @Post('settings')
  @Permissions('inventory:adjust')
  @Validate(upsertInventorySettingsRequestSchema)
  @ApiOperation({ summary: 'Set reorder point/quantity and bin location for a slot' })
  async upsertSettings(
    @Body() body: ReturnType<typeof upsertInventorySettingsRequestSchema.parse>,
  ) {
    return this.inventory.upsertSettings({
      warehouseId: body.warehouseId,
      productId: body.productId,
      variantId: body.variantId ?? null,
      reorderPoint: body.reorderPoint,
      reorderQuantity: body.reorderQuantity,
      binLocation: body.binLocation,
    });
  }

  @Post('adjust')
  @Permissions('inventory:adjust')
  @Validate(adjustInventoryRequestSchema)
  @ApiOperation({ summary: 'Manual stock adjustment (recount, damage, theft, expiry)' })
  async adjust(@Body() body: ReturnType<typeof adjustInventoryRequestSchema.parse>) {
    return this.inventory.adjust({
      warehouseId: body.warehouseId,
      productId: body.productId,
      variantId: body.variantId ?? null,
      quantityDelta: body.quantityDelta,
      type: body.type,
      reason: body.reason,
      unitCostMinor: body.unitCostMinor,
    });
  }

  @Post('transfer')
  @Permissions('inventory:adjust')
  @Validate(transferInventoryRequestSchema)
  @ApiOperation({ summary: 'Move stock between two warehouses' })
  async transfer(@Body() body: ReturnType<typeof transferInventoryRequestSchema.parse>) {
    await this.inventory.transfer({
      fromWarehouseId: body.fromWarehouseId,
      toWarehouseId: body.toWarehouseId,
      productId: body.productId,
      variantId: body.variantId ?? null,
      quantity: body.quantity,
      reason: body.reason,
    });
    return { message: 'Transferred.' };
  }

  @Get('movements/:productId')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Movement ledger for one product' })
  async movements(
    @Param('productId') productId: string,
    @Query(new ZodValidationPipe(inventoryMovementListQuerySchema))
    query: ReturnType<typeof inventoryMovementListQuerySchema.parse>,
  ) {
    const { items, total } = await this.inventory.listMovements(productId, query.page, query.limit);
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, total));
  }
}
