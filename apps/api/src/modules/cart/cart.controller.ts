import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addCartItemRequestSchema,
  applyCartCouponRequestSchema,
  updateCartItemRequestSchema,
} from '@ems/contracts';
import { ConflictError } from '@ems/kernel';
import { Public, Validate } from '../../common/decorators';
import { CartProductLookupRepository } from './cart-product-lookup.repository';
import { CartService } from './cart.service';

@ApiTags('cart')
@Controller({ path: 'storefront/cart', version: '1' })
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly products: CartProductLookupRepository,
  ) {}

  @Get(':cartId')
  @Public()
  @ApiOperation({ summary: 'Fetch a cart by id' })
  async get(@Param('cartId') cartId: string) {
    const cart = await this.cart.get(cartId);
    return this.cart.toResponse(cart, (await this.products.storePublicId(cart.storeId)) ?? cart.storeId);
  }

  @Post()
  @Public()
  @ApiOperation({ summary: 'Create a new empty cart for a store' })
  async create(@Query('storeId') storePublicId: string) {
    const storeId = await this.mustResolveStore(storePublicId);
    const cart = await this.cart.getOrCreate(null, storeId);
    return this.cart.toResponse(cart, storePublicId);
  }

  @Post(':cartId/items')
  @Public()
  @Validate(addCartItemRequestSchema)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add an item to the cart' })
  async addItem(
    @Param('cartId') cartId: string,
    @Query('storeId') storePublicId: string,
    @Body() body: ReturnType<typeof addCartItemRequestSchema.parse>,
  ) {
    const storeId = await this.mustResolveStore(storePublicId);
    const cart = await this.cart.addItem(cartId, storeId, body.productId, body.variantId ?? null, body.quantity);
    return this.cart.toResponse(cart, storePublicId);
  }

  @Put(':cartId/items/:productId')
  @Public()
  @Validate(updateCartItemRequestSchema)
  @ApiOperation({ summary: 'Change the quantity of a cart line (0 removes it)' })
  async updateItem(
    @Param('cartId') cartId: string,
    @Param('productId') productId: string,
    @Query('variantId') variantId: string | undefined,
    @Body() body: ReturnType<typeof updateCartItemRequestSchema.parse>,
  ) {
    const cart = await this.cart.updateItem(cartId, productId, variantId ?? null, body.quantity);
    return this.cart.toResponse(cart, (await this.products.storePublicId(cart.storeId)) ?? cart.storeId);
  }

  @Delete(':cartId/items/:productId')
  @Public()
  @ApiOperation({ summary: 'Remove a line from the cart' })
  async removeItem(
    @Param('cartId') cartId: string,
    @Param('productId') productId: string,
    @Query('variantId') variantId?: string,
  ) {
    const cart = await this.cart.removeItem(cartId, productId, variantId ?? null);
    return this.cart.toResponse(cart, (await this.products.storePublicId(cart.storeId)) ?? cart.storeId);
  }

  @Post(':cartId/coupon')
  @Public()
  @Validate(applyCartCouponRequestSchema)
  @ApiOperation({ summary: 'Apply a coupon code to the cart' })
  async applyCoupon(
    @Param('cartId') cartId: string,
    @Body() body: ReturnType<typeof applyCartCouponRequestSchema.parse>,
  ) {
    const cart = await this.cart.applyCoupon(cartId, body.code);
    return this.cart.toResponse(cart, (await this.products.storePublicId(cart.storeId)) ?? cart.storeId);
  }

  @Delete(':cartId/coupon')
  @Public()
  @ApiOperation({ summary: 'Remove the coupon applied to the cart' })
  async removeCoupon(@Param('cartId') cartId: string) {
    const cart = await this.cart.removeCoupon(cartId);
    return this.cart.toResponse(cart, (await this.products.storePublicId(cart.storeId)) ?? cart.storeId);
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    if (!storePublicId) throw new ConflictError('storeId is required');
    const storeId = await this.products.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }
}
