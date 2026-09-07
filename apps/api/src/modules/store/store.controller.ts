import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StoreResponse } from '@ems/contracts';
import { Permissions } from '../../common/decorators';
import type { StoreEntity } from '../../database/entities';
import { StoreRepository } from './store.repository';

/**
 * Read-only for now — store *settings* (logo, address, timezone, currency)
 * are their own later feature; this exists so the console has something to
 * populate a store picker / `storeId` from, which almost every other
 * merchant-facing feature (products, orders, inventory) requires.
 */
@ApiTags('stores')
@Controller({ path: 'console/stores', version: '1' })
export class StoreController {
  constructor(private readonly stores: StoreRepository) {}

  @Get()
  @Permissions('store:read')
  @ApiOperation({ summary: "List this tenant's stores" })
  async list(): Promise<StoreResponse[]> {
    const stores = await this.stores.listAll();
    return stores.map(toResponse);
  }

  @Get(':id')
  @Permissions('store:read')
  @ApiOperation({ summary: 'Get one store' })
  async get(@Param('id') id: string): Promise<StoreResponse> {
    return toResponse(await this.stores.findByPublicIdOrFail(id));
  }
}

function toResponse(store: StoreEntity): StoreResponse {
  return {
    id: store.publicId,
    name: store.name,
    slug: store.slug,
    status: store.status,
    currency: store.currency,
  };
}
