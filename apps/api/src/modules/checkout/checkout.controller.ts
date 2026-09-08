import { Body, Controller, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  checkoutPricingRequestSchema,
  confirmOrderPaymentRequestSchema,
  createRefundRequestSchema,
  placeOrderRequestSchema,
} from '@ems/contracts';
import { Idempotent, IdempotencyKey, Permissions, Public, Validate } from '../../common/decorators';
import { MalformedRequestError } from '../../common/errors/api.errors';
import { CheckoutService } from './checkout.service';

@ApiTags('checkout')
@Controller({ version: '1' })
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('storefront/checkout/pricing')
  @Public()
  @Validate(checkoutPricingRequestSchema)
  @ApiOperation({ summary: 'Preview subtotal/discount/shipping/tax/total for a cart' })
  async pricing(@Body() body: ReturnType<typeof checkoutPricingRequestSchema.parse>) {
    return this.checkout.priceOrder(body.cartId, body.shippingAddress, body.shippingMethod, body.paymentGateway);
  }

  @Post('storefront/checkout/orders')
  @Public()
  @Idempotent()
  @Validate(placeOrderRequestSchema)
  @ApiOperation({ summary: 'Place an order from a cart: address, shipping method and payment in one step' })
  async placeOrder(
    @Body() body: ReturnType<typeof placeOrderRequestSchema.parse>,
    @IdempotencyKey() idempotencyKey: string | null,
  ) {
    if (!idempotencyKey) throw new MalformedRequestError('Idempotency-Key header is required');
    return this.checkout.placeOrder(body, idempotencyKey);
  }

  @Post('storefront/checkout/confirm-payment')
  @Public()
  @Validate(confirmOrderPaymentRequestSchema)
  @ApiOperation({ summary: "Confirm a gateway's client-side checkout callback" })
  async confirmPayment(@Body() body: ReturnType<typeof confirmOrderPaymentRequestSchema.parse>) {
    return this.checkout.confirmPayment(body.gateway, body.gatewayOrderId, body.gatewayPaymentId, body.signature);
  }

  @Post('console/orders/:id/refund')
  @Permissions('order:refund')
  @Idempotent()
  @Validate(createRefundRequestSchema)
  @ApiOperation({ summary: 'Refund a captured payment, in whole or in part' })
  async refund(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof createRefundRequestSchema.parse>,
    @IdempotencyKey() idempotencyKey: string | null,
  ) {
    if (!idempotencyKey) throw new MalformedRequestError('Idempotency-Key header is required');
    return this.checkout.refund(id, body, idempotencyKey);
  }

  @Post('console/payments/reconcile')
  @Permissions('payment:reconcile')
  @ApiOperation({ summary: 'Re-check PENDING/AUTHORIZED order payments against their gateway' })
  async reconcile(@Query('olderThanMinutes') olderThanMinutes = '10', @Query('limit') limit = '50') {
    const settled = await this.checkout.reconcilePending(Number(olderThanMinutes), Number(limit));
    return { settled };
  }
}
