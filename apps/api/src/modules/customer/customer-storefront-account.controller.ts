import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addressRequestSchema,
  addWishlistItemRequestSchema,
  updateAddressRequestSchema,
  type AddressRequest,
  type AddWishlistItemRequest,
  type UpdateAddressRequest,
} from '@ems/contracts';
import { CustomerAuth, Validate } from '../../common/decorators';
import { RequestContextService } from '../../common/services/request-context.service';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';

@ApiTags('storefront-account')
@CustomerAuth()
@Controller({ path: 'storefront/account', version: '1' })
export class CustomerStorefrontAccountController {
  constructor(
    private readonly customers: CustomerService,
    private readonly customerRepository: CustomerRepository,
    private readonly context: RequestContextService,
  ) {}

  private async getCustomerPublicId(): Promise<string> {
    const customerId = this.context.customerId;
    if (!customerId) throw new UnauthorizedException('Customer authentication required');

    const customer = await this.customerRepository.findOne({ where: { id: customerId } as never });
    if (!customer) throw new NotFoundException('Customer profile not found');

    return customer.publicId;
  }

  // ---------------------------------------------------------------------------
  // Addresses
  // ---------------------------------------------------------------------------

  @Get('addresses')
  @ApiOperation({ summary: "List current customer's addresses" })
  async listAddresses() {
    const customerPublicId = await this.getCustomerPublicId();
    const addresses = await this.customers.listAddresses(customerPublicId);
    return addresses.map((a) => this.customers.addressToResponse(a));
  }

  @Post('addresses')
  @Validate(addressRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new address for current customer' })
  async addAddress(@Body() body: AddressRequest) {
    const customerPublicId = await this.getCustomerPublicId();
    const address = await this.customers.addAddress(customerPublicId, body);
    return this.customers.addressToResponse(address);
  }

  @Put('addresses/:id')
  @Validate(updateAddressRequestSchema)
  @ApiOperation({ summary: "Update an address belonging to current customer" })
  async updateAddress(
    @Param('id') addressId: string,
    @Body() body: UpdateAddressRequest,
  ) {
    const customerPublicId = await this.getCustomerPublicId();
    const address = await this.customers.updateAddress(customerPublicId, addressId, body);
    return this.customers.addressToResponse(address);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove an address belonging to current customer" })
  async removeAddress(@Param('id') addressId: string): Promise<void> {
    const customerPublicId = await this.getCustomerPublicId();
    await this.customers.removeAddress(customerPublicId, addressId);
  }

  // ---------------------------------------------------------------------------
  // Wishlist
  // ---------------------------------------------------------------------------

  @Get('wishlist')
  @ApiOperation({ summary: "List current customer's wishlist items" })
  async listWishlist() {
    const customerPublicId = await this.getCustomerPublicId();
    const items = await this.customers.listWishlist(customerPublicId);
    return items.map((i) => this.customers.wishlistItemToResponse(i));
  }

  @Post('wishlist')
  @Validate(addWishlistItemRequestSchema)
  @ApiOperation({ summary: 'Add an item to current customer wishlist' })
  async addWishlistItem(@Body() body: AddWishlistItemRequest) {
    const customerPublicId = await this.getCustomerPublicId();
    await this.customers.addWishlistItemByPublicIds(customerPublicId, body.productId, body.variantId ?? null);
    return { message: 'Item added to wishlist.' };
  }

  @Delete('wishlist/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from current customer wishlist' })
  async removeWishlistItem(
    @Param('productId') productId: string,
    @Query('variantId') variantId?: string,
  ): Promise<void> {
    const customerPublicId = await this.getCustomerPublicId();
    await this.customers.removeWishlistItemByPublicIds(customerPublicId, productId, variantId ?? null);
  }
}
