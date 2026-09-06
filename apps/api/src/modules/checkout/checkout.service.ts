import { Injectable, Logger } from '@nestjs/common';
import type {
  ConfirmOrderPaymentResponse,
  CreateRefundRequest,
  OrderAddress,
  PlaceOrderRequest,
  PlaceOrderResponse,
  RefundResponse,
} from '@ems/contracts';
import { BusinessRuleError, Money, NotFoundError, type CurrencyCode } from '@ems/kernel';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import { OutboxService } from '../../common/services/outbox.service';
import { CartEmptyError, OrderEmptyError } from '../../common/errors/api.errors';
import type { OrderAddressSnapshot } from '../../database/entities';
import { CartProductLookupRepository } from '../cart/cart-product-lookup.repository';
import { CartService, type StoredCart } from '../cart/cart.service';
import { CouponService } from '../coupon/coupon.service';
import { GiftCardService } from '../gift-card/gift-card.service';
import { InventoryService, type StockAllocation } from '../inventory/inventory.service';
import { OrderItemRepository, OrderRepository, OrderStatusHistoryRepository } from '../order/order.repository';
import { OrderPaymentService } from '../order-payment/order-payment.service';
import type { GatewayName, GatewayPayment } from '../../integrations/payment/payment-gateway.port';
import type { PaymentGateway } from '../../database/entities';
import { TaxCalculatorService } from './tax-calculator.service';
import { ShippingCarrierFactory } from '../../integrations/shipping/shipping-carrier.factory';
import { ShippingPincodeUnserviceableError } from '../../common/errors/api.errors';
import { MarketplaceOrderService } from '../marketplace/marketplace-order.service';

/** Used only when no warehouse origin is configured, or the carrier call itself fails —
 * checkout must degrade to a flat rate rather than hard-block on a carrier outage. */
const SHIPPING_RATES_MINOR: Record<string, string> = {
  STANDARD: '5000',
  EXPRESS: '15000',
};

/** Assumed weight for a product with no `weight_grams` set — keeps rate/serviceability calls sane. */
const DEFAULT_ITEM_WEIGHT_GRAMS = 200;

/** COD carries its own fee — collection risk and handling cost the merchant otherwise eats. */
const COD_FEE_MINOR = '3000';

interface PricedLine {
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  variantTitle: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: Money;
  lineSubtotal: Money;
  lineDiscount: Money;
  taxRate: string;
  lineTax: Money;
  taxBreakup: { name: string; rate: string; amountMinor: string }[];
  lineTotal: Money;
  trackInventory: boolean;
  allowBackorder: boolean;
  taxClassId: string | null;
  weightGrams: number;
  /** Set when this line is a marketplace-shared product — the tenant that actually supplies it. */
  supplierTenantId: string | null;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly cart: CartService,
    private readonly cartProducts: CartProductLookupRepository,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly statusHistory: OrderStatusHistoryRepository,
    private readonly orderPayments: OrderPaymentService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponService,
    private readonly giftCards: GiftCardService,
    private readonly tax: TaxCalculatorService,
    private readonly shippingCarriers: ShippingCarrierFactory,
    private readonly marketplace: MarketplaceOrderService,
    private readonly context: RequestContextService,
    private readonly outbox: OutboxService,
  ) {}

  // =========================================================================
  // Pricing (re-priced from live data — the cart's own numbers are a preview,
  // never trusted for the actual charge)
  // =========================================================================

  private async priceLines(cart: StoredCart, address: OrderAddress | undefined): Promise<PricedLine[]> {
    if (cart.items.length === 0) throw new CartEmptyError();
    const currency = cart.currency as CurrencyCode;

    return Promise.all(
      cart.items.map(async (item): Promise<PricedLine> => {
        const product = await this.cartProducts.getProductById(item.productId);
        if (!product || product.status !== 'ACTIVE') {
          throw new BusinessRuleError(`'${item.name}' is no longer available`);
        }
        const variant = item.variantId ? await this.cartProducts.getVariantById(item.variantId) : null;

        const unitPrice = Money.fromMinor(variant?.priceMinor ?? product.priceMinor, currency);
        const lineSubtotal = unitPrice.multiplyByQuantity(item.quantity);

        const { taxRate, taxMinor, breakup } = address
          ? await this.tax.computeLineTax(product.taxClassId ?? null, lineSubtotal, address.countryCode, address.stateCode ?? null)
          : { taxRate: '0', taxMinor: Money.zero(currency), breakup: [] };

        return {
          productId: product.id,
          variantId: variant?.id ?? null,
          sku: item.sku,
          name: item.name,
          variantTitle: item.variantTitle,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          unitPrice,
          lineSubtotal,
          lineDiscount: Money.zero(currency),
          taxRate,
          lineTax: taxMinor,
          taxBreakup: breakup,
          lineTotal: lineSubtotal.add(taxMinor),
          // A marketplace line's stock lives in the *supplier's* tenant, not
          // this one — `inventory_levels` for it doesn't even exist here.
          // Checkout skips reservation for it entirely; the supplier's own
          // sub-order (created post-confirmation by `MarketplaceOrderService`)
          // is fulfilled through their existing order pipeline, which already
          // knows how to reserve and commit their own stock.
          trackInventory: product.supplierTenantId ? false : product.trackInventory,
          allowBackorder: product.allowBackorder,
          taxClassId: product.taxClassId ?? null,
          weightGrams: variant?.weightGrams ?? product.weightGrams ?? DEFAULT_ITEM_WEIGHT_GRAMS,
          supplierTenantId: product.supplierTenantId ?? null,
        };
      }),
    );
  }

  /**
   * Serviceability + rate, degrading gracefully in two different ways for
   * two different failures:
   *
   *  - The carrier explicitly says the pincode is unserviceable → **blocks
   *    checkout** with a clear error (the Phase 6 exit criterion).
   *  - The carrier call itself errors (misconfigured, network, timeout) →
   *    logged and treated as serviceable with the flat placeholder rate, so
   *    a carrier outage does not take down checkout entirely.
   */
  private async computeShipping(
    storeId: string,
    lines: PricedLine[],
    address: OrderAddress,
    shippingMethod: string,
    isCod: boolean,
    currency: CurrencyCode,
  ): Promise<Money> {
    const flatFallback = () =>
      Money.fromMinor(SHIPPING_RATES_MINOR[shippingMethod.toUpperCase()] ?? SHIPPING_RATES_MINOR['STANDARD']!, currency);

    const origin = await this.cartProducts.defaultWarehouseOrigin(storeId);
    if (!origin) return flatFallback();

    const totalWeightGrams = lines.reduce((sum, line) => sum + line.weightGrams * line.quantity, 0);
    const serviceabilityInput = {
      originPincode: origin.postalCode,
      destinationPincode: address.postalCode,
      weightGrams: totalWeightGrams,
      isCod,
    };

    let carrier;
    try {
      carrier = this.shippingCarriers.resolve();
    } catch (error) {
      this.logger.warn(`No shipping carrier configured; falling back to flat rate: ${error instanceof Error ? error.message : error}`);
      return flatFallback();
    }

    let serviceability;
    try {
      serviceability = await carrier.checkServiceability(serviceabilityInput);
    } catch (error) {
      this.logger.warn(
        `Serviceability check failed against '${carrier.name}'; degrading to flat rate: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return flatFallback();
    }

    if (!serviceability.serviceable) {
      throw new ShippingPincodeUnserviceableError(address.postalCode, serviceability.reason);
    }

    try {
      const rates = await carrier.getRates(serviceabilityInput);
      const preferred =
        rates.find((r) => r.serviceType.toUpperCase() === shippingMethod.toUpperCase()) ?? rates[0];
      if (preferred) return Money.fromMinor(preferred.rateMinor, currency);
    } catch (error) {
      this.logger.warn(
        `Rate lookup failed against '${carrier.name}'; degrading to flat rate: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    return flatFallback();
  }

  /** Spreads a discount across lines proportionally to subtotal, using largest-remainder allocation. */
  private applyDiscountToLines(lines: PricedLine[], discount: Money, currency: CurrencyCode): void {
    if (discount.isZero || lines.length === 0) return;
    const shares = discount.allocate(lines.map((l) => (l.lineSubtotal.isZero ? 0n : l.lineSubtotal.amountMinor)));
    lines.forEach((line, i) => {
      line.lineDiscount = shares[i] ?? Money.zero(currency);
      line.lineTotal = line.lineSubtotal.subtract(line.lineDiscount).add(line.lineTax);
    });
  }

  async priceOrder(cartId: string, shippingAddress?: OrderAddress, shippingMethod = 'STANDARD') {
    const cart = await this.cart.get(cartId);
    const currency = cart.currency as CurrencyCode;
    const lines = await this.priceLines(cart, shippingAddress);

    const subtotal = Money.sum(lines.map((l) => l.lineSubtotal), currency);
    let discount = Money.zero(currency);
    if (cart.couponCode) {
      try {
        discount = (await this.coupons.validate(cart.couponCode, subtotal, null)).discount;
      } catch {
        discount = Money.zero(currency);
      }
    }
    this.applyDiscountToLines(lines, discount, currency);

    const shipping = shippingAddress
      ? await this.computeShipping(cart.storeId, lines, shippingAddress, shippingMethod, false, currency)
      : Money.fromMinor(SHIPPING_RATES_MINOR[shippingMethod.toUpperCase()] ?? SHIPPING_RATES_MINOR['STANDARD']!, currency);
    const tax = Money.sum(lines.map((l) => l.lineTax), currency);
    const total = subtotal.subtract(discount).add(shipping).add(tax);

    return {
      subtotal: subtotal.toJSON(),
      discount: discount.toJSON(),
      shipping: shipping.toJSON(),
      tax: tax.toJSON(),
      total: total.toJSON(),
    };
  }

  // =========================================================================
  // Place order
  // =========================================================================

  async placeOrder(input: PlaceOrderRequest, idempotencyKey: string): Promise<PlaceOrderResponse> {
    const cart = await this.cart.get(input.cartId);
    const storeId = cart.storeId;
    const currency = cart.currency as CurrencyCode;

    const lines = await this.priceLines(cart, input.shippingAddress);
    const subtotal = Money.sum(lines.map((l) => l.lineSubtotal), currency);

    let discount = Money.zero(currency);
    let coupon: Awaited<ReturnType<CouponService['validate']>>['coupon'] | null = null;
    if (cart.couponCode) {
      const result = await this.coupons.validate(cart.couponCode, subtotal, null);
      coupon = result.coupon;
      discount = result.discount;
    }
    this.applyDiscountToLines(lines, discount, currency);

    const isCod = input.paymentGateway === 'cod';
    const shippingCost = await this.computeShipping(
      storeId,
      lines,
      input.shippingAddress,
      input.shippingMethod,
      isCod,
      currency,
    );
    // COD carries its own fee — the collection risk and handling cost the
    // merchant would otherwise absorb — added on top like shipping, never
    // treated as a discount or folded into the item total.
    const codFee = isCod ? Money.fromMinor(COD_FEE_MINOR, currency) : Money.zero(currency);
    const tax = Money.sum(lines.map((l) => l.lineTax), currency);
    // The order's real total — a gift card is a *payment method* against this
    // total, not a discount on it, so it must never reduce this figure.
    const total = subtotal.subtract(discount).add(shippingCost).add(codFee).add(tax);

    return this.manager.transaction(async (tx) => {
      const ordersRepo = this.orders.withManager(tx);
      const orderItemsRepo = this.orderItems.withManager(tx);
      const historyRepo = this.statusHistory.withManager(tx);

      // Gift card, if any, is applied before the gateway ever sees a number —
      // its own balance is debited synchronously, inside this transaction —
      // and only reduces what's left to charge the gateway/COD for.
      let giftCardApplied = Money.zero(currency);
      if (input.giftCardCode) {
        const card = await this.giftCards.findByCode(input.giftCardCode);
        if (!card || !card.isRedeemable) {
          throw new BusinessRuleError(`Gift card '${input.giftCardCode}' is not valid`);
        }
        giftCardApplied = await this.giftCards.redeem(tx, card, total);
      }
      const remaining = total.subtract(giftCardApplied);

      const orderNumber = await ordersRepo.nextOrderNumber(tx);
      const shippingSnapshot = this.toAddressSnapshot(input.shippingAddress);
      const billingSnapshot = input.billingAddress ? this.toAddressSnapshot(input.billingAddress) : shippingSnapshot;

      const order = await ordersRepo.insert({
        storeId,
        orderNumber,
        customerId: null, // guest checkout — see CheckoutModule's doc comment for the auth follow-up
        email: input.email ?? null,
        phoneE164: input.phone ?? null,
        status: 'PENDING',
        paymentStatus: giftCardApplied.isZero ? 'PENDING' : remaining.isZero ? 'PAID' : 'PARTIALLY_PAID',
        fulfilmentStatus: 'UNFULFILLED',
        currency,
        subtotalMinor: subtotal.amountMinor.toString(),
        discountMinor: discount.amountMinor.toString(),
        shippingMinor: shippingCost.amountMinor.toString(),
        taxMinor: tax.amountMinor.toString(),
        codFeeMinor: codFee.amountMinor.toString(),
        totalMinor: total.amountMinor.toString(),
        amountPaidMinor: giftCardApplied.amountMinor.toString(),
        amountRefundedMinor: '0',
        shippingAddress: shippingSnapshot,
        billingAddress: billingSnapshot,
        channel: 'WEB',
        couponId: coupon?.id ?? null,
        couponCode: coupon?.code ?? null,
        customerNote: input.customerNote ?? null,
        correlationId: this.context.correlationId ?? null,
      });

      // Reserve inventory per line, rolling back every reservation this call
      // already made if a later line can't be covered — see InventoryService's
      // own all-or-nothing guarantee within one line; this loop extends it
      // across the whole order.
      const allocationsByLine: (StockAllocation[] | null)[] = [];
      try {
        for (const line of lines) {
          if (!line.trackInventory) {
            allocationsByLine.push(null);
            continue;
          }
          const allocations = await this.inventory.reserveAcrossWarehouses(tx, {
            storeId,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            referenceType: 'ORDER',
            referenceId: order.id,
          });
          allocationsByLine.push(allocations);
        }
      } catch (error) {
        for (const [index, allocations] of allocationsByLine.entries()) {
          if (!allocations) continue;
          const line = lines[index]!;
          await this.inventory.releaseAllocations(tx, allocations, {
            productId: line.productId,
            variantId: line.variantId,
            referenceType: 'ORDER',
            referenceId: order.id,
          });
        }
        throw error;
      }

      for (const [index, line] of lines.entries()) {
        const allocations = allocationsByLine[index];
        await orderItemsRepo.insert({
          orderId: order.id,
          productId: line.productId,
          variantId: line.variantId,
          sku: line.sku,
          name: line.name,
          variantTitle: line.variantTitle,
          imageUrl: line.imageUrl,
          hsnCode: null,
          quantity: line.quantity,
          unitPriceMinor: line.unitPrice.amountMinor.toString(),
          lineSubtotalMinor: line.lineSubtotal.amountMinor.toString(),
          lineDiscountMinor: line.lineDiscount.amountMinor.toString(),
          taxRate: line.taxRate,
          lineTaxMinor: line.lineTax.amountMinor.toString(),
          lineTotalMinor: line.lineTotal.amountMinor.toString(),
          taxBreakup: line.taxBreakup.length > 0 ? line.taxBreakup : null,
          // Only the first warehouse of a (possibly split) allocation is kept —
          // enough to drive cancellation/restock for the common single-warehouse
          // case; a line genuinely split across warehouses restocks fully
          // against this one on cancellation, which is a documented simplification.
          warehouseId: allocations?.[0]?.warehouseId ?? null,
          // Commission is computed and stamped after confirmation
          // (`MarketplaceOrderService.processConfirmedOrder`), against a
          // freshly-read product share rather than anything priced at cart time.
          supplierTenantId: line.supplierTenantId,
        });
      }

      if (lines.some((line) => line.supplierTenantId)) {
        order.isMarketplaceOrder = true;
        await ordersRepo.save(order);
      }

      await historyRepo.record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus: null,
        toStatus: 'PENDING',
        actorType: 'CUSTOMER',
        correlationId: this.context.correlationId ?? null,
      });

      if (coupon) {
        await this.coupons.redeem(tx, coupon, order.id, null, discount);
      }

      // Fully covered by the gift card — no gateway involved at all.
      if (remaining.isZero) {
        await this.commitOrderConfirmed(tx, order.id, allocationsByLine, lines, orderNumber);
        await this.cart.clear(input.cartId);
        return {
          orderId: order.publicId,
          orderNumber,
          total: total.toJSON(),
          paymentStatus: 'PAID',
          payment: null,
        };
      }

      const gatewayValue = input.paymentGateway.toUpperCase() as PaymentGateway;
      const session = await this.orderPayments.open(tx, {
        orderId: order.id,
        storeId,
        amount: remaining,
        gateway: gatewayValue,
        idempotencyKey,
        customer: { name: input.shippingAddress.recipientName, email: input.email, phone: input.phone },
        description: `Order ${orderNumber}`,
      });

      // COD is confirmed immediately: there is no gateway round trip to wait
      // for, so the sale is committed now and the remaining balance is
      // collected for real at delivery. `paymentStatus` is left exactly as
      // set at insert time (PENDING, or PARTIALLY_PAID if a gift card covered
      // part of it) — COD confirms the *order*, not the payment.
      if (input.paymentGateway === 'cod') {
        await this.commitOrderConfirmed(tx, order.id, allocationsByLine, lines, orderNumber);
      }

      await this.cart.clear(input.cartId);

      const refreshedOrder = await ordersRepo.findOneOrFail({ where: { id: order.id } });
      return {
        orderId: order.publicId,
        orderNumber,
        total: total.toJSON(),
        paymentStatus: refreshedOrder.paymentStatus,
        payment:
          session.clientPayload !== null
            ? { paymentId: session.payment.publicId, gateway: session.payment.gateway, clientPayload: session.clientPayload }
            : null,
      };
    });
  }

  /**
   * Commits every line's reservation to a real sale and moves the order to
   * CONFIRMED. Deliberately leaves `paymentStatus`/`amountPaidMinor` alone —
   * those are set once at order creation (from the gift-card portion, if any)
   * and settled separately by `settleAndConfirm` once a gateway capture (or
   * COD collection) actually happens.
   */
  private async commitOrderConfirmed(
    tx: EntityManager,
    orderId: string,
    allocationsByLine: (StockAllocation[] | null)[],
    lines: PricedLine[],
    orderNumber: string,
  ): Promise<void> {
    const ordersRepo = this.orders.withManager(tx);
    const historyRepo = this.statusHistory.withManager(tx);

    for (const [index, allocations] of allocationsByLine.entries()) {
      if (!allocations) continue;
      const line = lines[index]!;
      await this.inventory.commitAllocations(tx, allocations, {
        productId: line.productId,
        variantId: line.variantId,
        referenceType: 'ORDER',
        referenceId: orderId,
      });
    }

    const order = await ordersRepo.findOneOrFail({ where: { id: orderId } });
    const fromStatus = order.status;
    Object.assign(order, {
      status: 'CONFIRMED',
      placedAt: order.placedAt ?? new Date(),
      confirmedAt: new Date(),
    });
    await ordersRepo.save(order);

    await historyRepo.record({
      orderId,
      statusType: 'ORDER',
      fromStatus,
      toStatus: 'CONFIRMED',
      actorType: 'SYSTEM',
      correlationId: this.context.correlationId ?? null,
    });

    // A no-op for a non-marketplace order (it reads the order's own items to
    // decide) — see `MarketplaceOrderService.processConfirmedOrder`'s own
    // doc comment for why both confirmation paths call it unconditionally.
    await this.marketplace.processConfirmedOrder(tx, orderId);

    await this.outbox.emit(tx, {
      aggregateType: 'ORDER',
      aggregateId: orderId,
      eventType: 'order.placed',
      payload: { orderNumber, storeId: order.storeId, totalMinor: order.totalMinor, currency: order.currency },
    });

    this.logger.log(`Order ${orderNumber} confirmed`);
  }

  private toAddressSnapshot(address: OrderAddress): OrderAddressSnapshot {
    return {
      recipientName: address.recipientName,
      phoneE164: address.phone ?? null,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? null,
      landmark: address.landmark ?? null,
      city: address.city,
      stateCode: address.stateCode ?? null,
      stateName: address.stateName ?? null,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
    };
  }

  // =========================================================================
  // Payment confirmation (client callback and webhook both land here)
  // =========================================================================

  async confirmPayment(
    gateway: GatewayName,
    gatewayOrderId: string,
    gatewayPaymentId: string,
    signature: string,
  ): Promise<ConfirmOrderPaymentResponse> {
    const result = await this.orderPayments.verifyCallback(gateway, gatewayOrderId, gatewayPaymentId, signature);
    return this.settleAndConfirm(gateway, gatewayOrderId, gatewayPaymentId, result);
  }

  /** Shared by the client-callback and webhook paths — both must converge on identical state. */
  async settleAndConfirm(
    gateway: GatewayName,
    gatewayOrderId: string | null,
    gatewayPaymentId: string,
    result: GatewayPayment,
  ): Promise<ConfirmOrderPaymentResponse> {
    return this.manager.transaction(async (tx) => {
      const existing = await this.orderPayments.findByGatewayRef(gateway.toUpperCase(), gatewayOrderId, gatewayPaymentId);
      if (!existing) {
        this.logger.warn(`No local payment row for ${gateway} order=${gatewayOrderId} payment=${gatewayPaymentId}`);
        return { status: result.status, orderId: null, orderNumber: null };
      }

      const payment = await this.orderPayments.settle(tx, existing.id, result);

      if (payment.status !== 'CAPTURED' || !payment.orderId) {
        return { status: payment.status, orderId: null, orderNumber: null };
      }

      const ordersRepo = this.orders.withManager(tx);
      const order = await ordersRepo.findOneOrFail({ where: { id: payment.orderId } });

      // Already confirmed — the other race winner (a near-simultaneous webhook
      // and client callback) got here first. Idempotent by design.
      if (order.status === 'CONFIRMED' || order.status === 'PROCESSING' || order.status === 'SHIPPED') {
        return { status: 'CAPTURED', orderId: order.publicId, orderNumber: order.orderNumber };
      }

      const orderItemsRepo = this.orderItems.withManager(tx);
      const items = await orderItemsRepo.findByOrder(order.id);

      for (const item of items) {
        if (item.warehouseId && item.productId) {
          await this.inventory.commitByProduct(tx, {
            warehouseId: item.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity - item.quantityCancelled,
            referenceType: 'ORDER',
            referenceId: order.id,
          });
        }
      }

      // `amountPaidMinor` may already hold a gift-card portion applied at
      // order creation — the gateway capture adds to it rather than replacing
      // it, so a partially gift-card-funded order still totals correctly.
      const currency = order.currency as CurrencyCode;
      const totalPaid = Money.fromMinor(order.amountPaidMinor, currency).add(
        Money.fromMinor(payment.amountCapturedMinor, currency),
      );
      const orderTotal = Money.fromMinor(order.totalMinor, currency);

      const fromStatus = order.status;
      Object.assign(order, {
        status: 'CONFIRMED',
        paymentStatus: totalPaid.greaterThanOrEqual(orderTotal) ? 'PAID' : 'PARTIALLY_PAID',
        amountPaidMinor: totalPaid.amountMinor.toString(),
        placedAt: order.placedAt ?? new Date(),
        confirmedAt: new Date(),
      });
      await ordersRepo.save(order);

      await this.statusHistory.withManager(tx).record({
        orderId: order.id,
        statusType: 'ORDER',
        fromStatus,
        toStatus: 'CONFIRMED',
        actorType: 'WEBHOOK',
        correlationId: this.context.correlationId ?? null,
      });

      await this.marketplace.processConfirmedOrder(tx, order.id);

      // Guarded above by the `order.status === 'CONFIRMED' | ...` early return —
      // a replayed webhook racing the client callback never reaches here twice.
      await this.outbox.emit(tx, {
        aggregateType: 'ORDER',
        aggregateId: order.id,
        eventType: 'order.placed',
        payload: { orderNumber: order.orderNumber, storeId: order.storeId, totalMinor: order.totalMinor, currency: order.currency },
      });

      return { status: 'CAPTURED', orderId: order.publicId, orderNumber: order.orderNumber };
    });
  }

  /**
   * Re-checks PENDING/AUTHORIZED order payments against their gateway.
   *
   * Needed because webhooks get lost, and a shopper who closes the tab
   * mid-redirect never triggers the client-callback path either — without
   * this, money can sit collected at the gateway while the order stays stuck
   * PENDING forever (the exact Phase 6 exit criterion: "a payment stuck in
   * PENDING is resolved by the reconciler without human intervention").
   * Converges on `settleAndConfirm`, the same path the webhook and the
   * client callback use, so all three can never disagree about the outcome.
   */
  async reconcilePending(olderThanMinutes = 10, limit = 50): Promise<number> {
    const stale = await this.orderPayments.findStalePending(olderThanMinutes, limit);
    let settled = 0;

    for (const payment of stale) {
      if (!payment.gatewayPaymentId) continue; // no gateway payment was ever created — nothing to check

      try {
        const result = await this.orderPayments.fetchAuthoritative(payment.gateway, payment.gatewayPaymentId);
        if (result.status === 'CAPTURED' || result.status === 'FAILED') {
          await this.settleAndConfirm(
            payment.gateway.toLowerCase() as GatewayName,
            payment.gatewayOrderId,
            payment.gatewayPaymentId,
            result,
          );
          settled += 1;
        }
      } catch (error) {
        // One unreachable gateway must not stop the sweep for the others.
        this.logger.warn(
          `Reconciliation failed for order payment ${payment.publicId}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    return settled;
  }

  // =========================================================================
  // Refunds
  // =========================================================================

  async refund(orderPublicId: string, input: CreateRefundRequest, idempotencyKey: string): Promise<RefundResponse> {
    return this.manager.transaction(async (tx) => {
      const ordersRepo = this.orders.withManager(tx);
      const order = await ordersRepo.findByPublicIdOrFail(orderPublicId);

      const payments = await this.orderPayments.findByOrder(order.id);
      const payment = payments.find((p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED');
      if (!payment) throw new NotFoundError('Capturable payment for this order');

      const currency = order.currency as CurrencyCode;
      const amount = input.amountMinor ? Money.fromMinor(input.amountMinor, currency) : null;

      const refund = await this.orderPayments.refund(
        tx,
        payment,
        amount,
        input.reason ?? null,
        input.returnId ?? null,
        idempotencyKey,
      );

      const newRefunded = Money.fromMinor(order.amountRefundedMinor, currency).add(
        Money.fromMinor(refund.amountMinor, currency),
      );
      Object.assign(order, {
        amountRefundedMinor: newRefunded.amountMinor.toString(),
        paymentStatus: newRefunded.equals(Money.fromMinor(order.amountPaidMinor, currency))
          ? 'REFUNDED'
          : 'PARTIALLY_REFUNDED',
      });
      await ordersRepo.save(order);

      // A no-op for a non-marketplace order — see the method's own doc comment.
      await this.marketplace.reverseForRefund(tx, order.id, refund.amountMinor);

      return {
        id: refund.publicId,
        paymentId: payment.publicId,
        amount: Money.fromMinor(refund.amountMinor, currency).toJSON(),
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      };
    });
  }
}
