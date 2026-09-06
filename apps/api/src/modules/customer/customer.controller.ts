import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addWishlistItemRequestSchema,
  addressRequestSchema,
  buildPaginationMeta,
  createCustomerRequestSchema,
  customerListQuerySchema,
  updateAddressRequestSchema,
  updateCustomerRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';

@ApiTags('customers')
@Controller({ path: 'console/customers', version: '1' })
export class CustomerController {
  constructor(
    private readonly customers: CustomerService,
    private readonly customerRepository: CustomerRepository,
  ) {}

  @Get()
  @Permissions('customer:read')
  @ApiOperation({ summary: 'List customers' })
  async list(
    @Query(new ZodValidationPipe(customerListQuerySchema))
    query: ReturnType<typeof customerListQuerySchema.parse>,
  ) {
    const { items, total } = await this.customers.list({
      page: query.page,
      limit: query.limit,
      storeId: query.storeId,
      status: query.status,
      sort: query.sort,
    });

    const storeNames = await this.customerRepository.storePublicIds(items.map((c) => c.storeId));
    return new Paginated(
      items.map((c) => this.customers.toResponse(c, storeNames.get(c.storeId) ?? c.storeId)),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get(':id')
  @Permissions('customer:read')
  @ApiOperation({ summary: 'Get a customer' })
  async get(@Param('id') id: string) {
    const customer = await this.customers.getByPublicId(id);
    const storePublicId = await this.customerRepository.storePublicId(customer.storeId);
    return this.customers.toResponse(customer, storePublicId ?? customer.storeId);
  }

  @Post()
  @Permissions('customer:create')
  @Validate(createCustomerRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a customer (merchant-initiated, e.g. for a manual/POS order)' })
  async create(@Body() body: ReturnType<typeof createCustomerRequestSchema.parse>) {
    const customer = await this.customers.create(body);
    const storePublicId = await this.customerRepository.storePublicId(customer.storeId);
    return this.customers.toResponse(customer, storePublicId ?? customer.storeId);
  }

  @Put(':id')
  @Permissions('customer:update')
  @Validate(updateCustomerRequestSchema)
  @ApiOperation({ summary: 'Update a customer' })
  async update(@Param('id') id: string, @Body() body: ReturnType<typeof updateCustomerRequestSchema.parse>) {
    const customer = await this.customers.update(id, body);
    const storePublicId = await this.customerRepository.storePublicId(customer.storeId);
    return this.customers.toResponse(customer, storePublicId ?? customer.storeId);
  }

  // ---------------------------------------------------------------------------
  // Addresses
  // ---------------------------------------------------------------------------

  @Get(':id/addresses')
  @Permissions('customer:read')
  @ApiOperation({ summary: "List a customer's addresses" })
  async listAddresses(@Param('id') id: string) {
    const addresses = await this.customers.listAddresses(id);
    return addresses.map((a) => this.customers.addressToResponse(a));
  }

  @Post(':id/addresses')
  @Permissions('customer:update')
  @Validate(addressRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an address' })
  async addAddress(@Param('id') id: string, @Body() body: ReturnType<typeof addressRequestSchema.parse>) {
    const address = await this.customers.addAddress(id, body);
    return this.customers.addressToResponse(address);
  }

  @Put(':id/addresses/:addressId')
  @Permissions('customer:update')
  @Validate(updateAddressRequestSchema)
  @ApiOperation({ summary: 'Update an address' })
  async updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() body: ReturnType<typeof updateAddressRequestSchema.parse>,
  ) {
    const address = await this.customers.updateAddress(id, addressId, body);
    return this.customers.addressToResponse(address);
  }

  @Delete(':id/addresses/:addressId')
  @Permissions('customer:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an address' })
  async removeAddress(@Param('id') id: string, @Param('addressId') addressId: string): Promise<void> {
    await this.customers.removeAddress(id, addressId);
  }

  // ---------------------------------------------------------------------------
  // Wishlist (merchant view — the storefront customer manages their own via the
  // storefront surface once customer auth lands)
  // ---------------------------------------------------------------------------

  @Get(':id/wishlist')
  @Permissions('customer:read')
  @ApiOperation({ summary: "List a customer's wishlist" })
  async listWishlist(@Param('id') id: string) {
    const items = await this.customers.listWishlist(id);
    return items.map((i) => this.customers.wishlistItemToResponse(i));
  }

  @Post(':id/wishlist')
  @Permissions('customer:update')
  @Validate(addWishlistItemRequestSchema)
  @ApiOperation({ summary: "Add a product to a customer's wishlist" })
  async addWishlistItem(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof addWishlistItemRequestSchema.parse>,
  ) {
    // productId/variantId here are public ids; the service resolves internal ids
    // via the product module's own repository through a raw lookup to avoid a
    // hard module dependency for one query.
    await this.customers.addWishlistItemByPublicIds(id, body.productId, body.variantId ?? null);
    return { message: 'Added.' };
  }

  @Delete(':id/wishlist/:productId')
  @Permissions('customer:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a product from a customer's wishlist" })
  async removeWishlistItem(
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Query('variantId') variantId?: string,
  ): Promise<void> {
    await this.customers.removeWishlistItemByPublicIds(id, productId, variantId ?? null);
  }
}
