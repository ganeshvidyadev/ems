import { Inject, Injectable } from '@nestjs/common';
import type { CartLineItem, CartResponse } from '@ems/contracts';
import { Money, newPublicId, type CurrencyCode } from '@ems/kernel';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { RequestContextService } from '../../common/services/request-context.service';
import { CartEmptyError } from '../../common/errors/api.errors';
import { CouponService } from '../coupon/coupon.service';
import { CartProductLookupRepository } from './cart-product-lookup.repository';

/** 30 days, matching docs/02 §10 — long enough for cross-device continuity, short
 * enough that an abandoned cart doesn't hold a stale price indefinitely. */
const CART_TTL_SECONDS = 30 * 24 * 60 * 60;

interface StoredCartItem {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  variantTitle: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: string;
  addedAt: string;
}

interface StoredCart {
  id: string;
  storeId: string;
  currency: string;
  items: StoredCartItem[];
  couponCode: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CartService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly context: RequestContextService,
    private readonly products: CartProductLookupRepository,
    private readonly coupons: CouponService,
  ) {}

  private key(cartId: string): string {
    const tenantId = this.context.requireTenantId('cart access');
    return `cart:${tenantId}:${cartId}`;
  }

  async getOrCreate(cartId: string | null, storeId: string): Promise<StoredCart> {
    if (cartId) {
      const existing = await this.read(cartId);
      if (existing) return existing;
    }

    const cart: StoredCart = {
      id: cartId ?? newPublicId(),
      storeId,
      currency: 'INR',
      items: [],
      couponCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.write(cart);
    return cart;
  }

  private async read(cartId: string): Promise<StoredCart | null> {
    const raw = await this.redis.get(this.key(cartId));
    return raw ? (JSON.parse(raw) as StoredCart) : null;
  }

  private async write(cart: StoredCart): Promise<void> {
    cart.updatedAt = new Date().toISOString();
    await this.redis.setex(this.key(cart.id), CART_TTL_SECONDS, JSON.stringify(cart));
  }

  private async mustRead(cartId: string): Promise<StoredCart> {
    const cart = await this.read(cartId);
    if (!cart) throw new CartEmptyError();
    return cart;
  }

  async addItem(
    cartId: string,
    storeId: string,
    productPublicId: string,
    variantPublicId: string | null,
    quantity: number,
  ): Promise<StoredCart> {
    const cart = (await this.read(cartId)) ?? (await this.getOrCreate(cartId, storeId));

    const product = await this.products.getProduct(productPublicId);
    if (!product || product.storeId !== storeId || product.status !== 'ACTIVE') {
      throw new CartEmptyError(); // TODO(Phase 5 follow-up): a dedicated PRODUCT_NOT_AVAILABLE code
    }

    let variant: Awaited<ReturnType<CartProductLookupRepository['getVariant']>> = null;
    if (variantPublicId) {
      variant = await this.products.getVariant(variantPublicId);
      if (!variant || variant.productId !== product.id) throw new CartEmptyError();
    }

    const sku = variant?.sku ?? product.sku ?? product.publicId;
    const unitPriceMinor = variant?.priceMinor ?? product.priceMinor;

    const existing = cart.items.find(
      (item) => item.productId === product.id && item.variantId === (variant?.id ?? null),
    );

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        sku,
        name: product.name,
        variantTitle: variant?.title ?? null,
        imageUrl: product.imageUrl,
        quantity,
        unitPriceMinor,
        addedAt: new Date().toISOString(),
      });
    }

    cart.currency = product.currency;
    await this.write(cart);
    return cart;
  }

  async updateItem(
    cartId: string,
    productPublicId: string,
    variantPublicId: string | null,
    quantity: number,
  ): Promise<StoredCart> {
    const cart = await this.mustRead(cartId);
    const product = await this.products.getProduct(productPublicId);
    const variant = variantPublicId ? await this.products.getVariant(variantPublicId) : null;
    const productId = product?.id;

    if (quantity <= 0) {
      cart.items = cart.items.filter(
        (item) => !(item.productId === productId && item.variantId === (variant?.id ?? null)),
      );
    } else {
      const line = cart.items.find(
        (item) => item.productId === productId && item.variantId === (variant?.id ?? null),
      );
      if (line) line.quantity = quantity;
    }

    await this.write(cart);
    return cart;
  }

  async removeItem(cartId: string, productPublicId: string, variantPublicId: string | null): Promise<StoredCart> {
    return this.updateItem(cartId, productPublicId, variantPublicId, 0);
  }

  async applyCoupon(cartId: string, code: string): Promise<StoredCart> {
    const cart = await this.mustRead(cartId);
    const subtotal = this.subtotal(cart);
    // Validated for its own sake — an invalid code throws and is never stored,
    // even though checkout re-validates authoritatively at order placement.
    await this.coupons.validate(code, subtotal, null);
    cart.couponCode = code.toUpperCase();
    await this.write(cart);
    return cart;
  }

  async removeCoupon(cartId: string): Promise<StoredCart> {
    const cart = await this.mustRead(cartId);
    cart.couponCode = null;
    await this.write(cart);
    return cart;
  }

  async get(cartId: string): Promise<StoredCart> {
    return this.mustRead(cartId);
  }

  async clear(cartId: string): Promise<void> {
    await this.redis.del(this.key(cartId));
  }

  private subtotal(cart: StoredCart): Money {
    const currency = cart.currency as CurrencyCode;
    return cart.items.reduce(
      (sum, item) => sum.add(Money.fromMinor(item.unitPriceMinor, currency).multiplyByQuantity(item.quantity)),
      Money.zero(currency),
    );
  }

  /**
   * Pricing preview only. Shipping needs a chosen method and tax needs a
   * shipping address — neither is known to a cart in the abstract, so both
   * read as zero here and become real numbers once checkout has an address
   * (see `CheckoutService.priceOrder`).
   */
  async toResponse(cart: StoredCart, storePublicId: string): Promise<CartResponse> {
    const currency = cart.currency as CurrencyCode;
    const subtotal = this.subtotal(cart);

    let discount = Money.zero(currency);
    if (cart.couponCode) {
      try {
        const result = await this.coupons.validate(cart.couponCode, subtotal, null);
        discount = result.discount;
      } catch {
        discount = Money.zero(currency);
      }
    }

    const shippingEstimate = Money.zero(currency);
    const taxEstimate = Money.zero(currency);
    const total = subtotal.subtract(discount).add(shippingEstimate).add(taxEstimate);

    /**
     * Lines are stored against **internal** ids (`addItem` writes `product.id`),
     * but `cartLineItemSchema` types `productId`/`variantId` as public ids — and
     * `updateItem`/`removeItem` resolve what they are given with
     * `getProduct(publicId)`. Emitting the internal id therefore handed clients a
     * value those endpoints cannot resolve: they found no matching line, changed
     * nothing, and still answered 200, so a quantity change or a remove silently
     * did nothing.
     *
     * Resolved here rather than by storing public ids in Redis: the internal id is
     * the right key for the stored cart (it is what checkout and inventory join
     * on), and this is the boundary where internal ids stop being appropriate.
     */
    const items: CartLineItem[] = await Promise.all(
      cart.items.map(async (item) => {
        const [product, variant] = await Promise.all([
          this.products.getProductById(item.productId),
          item.variantId ? this.products.getVariantById(item.variantId) : Promise.resolve(null),
        ]);

        return {
          // Falling back to the stored id keeps a line for a since-deleted product
          // renderable — the shopper can still see it and remove it — rather than
          // failing the whole cart read.
          productId: product?.publicId ?? item.productId,
          variantId: variant?.publicId ?? item.variantId,
          sku: item.sku,
          name: item.name,
          variantTitle: item.variantTitle,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineSubtotalMinor: Money.fromMinor(item.unitPriceMinor, currency)
            .multiplyByQuantity(item.quantity)
            .amountMinor.toString(),
          addedAt: item.addedAt,
        };
      }),
    );

    return {
      id: cart.id,
      storeId: storePublicId,
      currency: cart.currency,
      items,
      itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
      couponCode: cart.couponCode,
      subtotal: subtotal.toJSON(),
      discount: discount.toJSON(),
      shippingEstimate: shippingEstimate.toJSON(),
      taxEstimate: taxEstimate.toJSON(),
      total: total.toJSON(),
      expiresAt: new Date(Date.now() + CART_TTL_SECONDS * 1000).toISOString(),
    };
  }
}

export type { StoredCart, StoredCartItem };
