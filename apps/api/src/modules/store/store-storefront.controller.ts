import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StorefrontStoreResponse } from '@ems/contracts';
import { NotFoundError } from '@ems/kernel';
import { Public } from '../../common/decorators';
import { StoreRepository } from './store.repository';

/**
 * Public, read-only: the one store fact a storefront page needs before it can
 * render anything — the shop's name for the header, its currency, and its public
 * id.
 *
 * There is no `:id` parameter on purpose. `StoreController` takes one because a
 * merchant legitimately picks between their tenant's stores; a shopper cannot,
 * because the hostname they arrived on already decided it. So this resolves the
 * store implicitly from the tenant context the host resolved — the same way
 * `ProductStorefrontController` never asks which catalogue to read.
 *
 * The public id is here because `POST storefront/cart` and `POST
 * storefront/cart/:id/items` both require one and the storefront had no honest
 * way to obtain it. That is not a leak: it is the tenant's own store, reachable
 * only from that tenant's own hostname, and it is already on every product in
 * the catalogue response.
 */
@ApiTags('storefront-store')
@Controller({ path: 'storefront/store', version: '1' })
export class StoreStorefrontController {
  constructor(private readonly stores: StoreRepository) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "Public details of the store this hostname resolves to" })
  async get(): Promise<StorefrontStoreResponse> {
    // `listAll()` is already tenant-scoped and orders ACTIVE first, so the head of
    // the list is the store a shopper should be shown. Reusing it keeps one
    // definition of "this tenant's stores, best first" rather than a second query
    // that could drift from it.
    const [store] = await this.stores.listAll();
    if (!store) throw new NotFoundError('Store', 'current');

    return {
      id: store.publicId,
      name: store.name,
      slug: store.slug,
      currency: store.currency,
    };
  }
}
