import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { WarehouseResponse } from '@ems/contracts';
import { Permissions } from '../../common/decorators';
import type { WarehouseEntity } from '../../database/entities';
import { WarehouseRepository } from './warehouse.repository';

/**
 * Read-only for now — this exists so inventory adjust/transfer/settings forms
 * have something to populate a warehouse picker from.
 */
@ApiTags('inventory')
@Controller({ path: 'console/warehouses', version: '1' })
export class WarehouseController {
  constructor(private readonly warehouses: WarehouseRepository) {}

  @Get()
  @Permissions('warehouse:read')
  @ApiOperation({ summary: "List this tenant's warehouses" })
  async list(): Promise<WarehouseResponse[]> {
    const warehouses = await this.warehouses.listAll();
    return warehouses.map(toResponse);
  }

  @Get(':id')
  @Permissions('warehouse:read')
  @ApiOperation({ summary: 'Get one warehouse' })
  async get(@Param('id') id: string): Promise<WarehouseResponse> {
    return toResponse(await this.warehouses.findByPublicIdOrFail(id));
  }
}

function toResponse(warehouse: WarehouseEntity): WarehouseResponse {
  return {
    id: warehouse.publicId,
    code: warehouse.code,
    name: warehouse.name,
    type: warehouse.type,
    isDefault: warehouse.isDefault,
    isActive: warehouse.isActive,
  };
}
