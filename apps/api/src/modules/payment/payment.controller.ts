import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import {
  AllowDuringOnboarding,
  IdempotencyKey,
  Permissions,
  Public,
} from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequestContextService } from '../../common/services/request-context.service';
import { SubscriptionInvoiceEntity } from '../../database/entities';
import { PaymentGatewayFactory } from '../../integrations/payment/payment-gateway.factory';
import type { GatewayName } from '../../integrations/payment/payment-gateway.port';
import { StubPaymentAdapter } from '../../integrations/payment/stub/stub.adapter';
import { PaymentService } from './payment.service';

const checkoutSchema = z.object({
  invoiceId: z.string().length(26),
  gateway: z
    .enum(['razorpay', 'stripe', 'paypal', 'cashfree', 'phonepe', 'stub'])
    .optional(),
});

const confirmSchema = z.object({
  gateway: z.enum(['razorpay', 'stripe', 'paypal', 'cashfree', 'phonepe', 'stub']),
  orderId: z.string().min(1).max(191),
  paymentId: z.string().min(1).max(191),
  signature: z.string().min(1).max(512),
});

@ApiTags('billing')
@Controller({ path: 'console/billing', version: '1' })
export class BillingController {
  constructor(
    private readonly payments: PaymentService,
    private readonly gateways: PaymentGatewayFactory,
    private readonly context: RequestContextService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('invoices')
  @AllowDuringOnboarding()
  @Permissions('invoice:read')
  @ApiOperation({ summary: 'List invoices for the current tenant' })
  async invoices() {
    const tenantId = this.context.requireTenantId('list invoices');

    const invoices = await this.dataSource.getRepository(SubscriptionInvoiceEntity).find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return invoices.map((invoice) => ({
      id: invoice.publicId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalMinor: invoice.totalMinor,
      amountDueMinor: invoice.amountDueMinor,
      currency: invoice.currency,
      periodStart: invoice.periodStart?.toISOString?.() ?? null,
      periodEnd: invoice.periodEnd?.toISOString?.() ?? null,
      dueAt: invoice.dueAt?.toISOString?.() ?? null,
      paidAt: invoice.paidAt?.toISOString?.() ?? null,
      lineItems: invoice.lineItems,
    }));
  }

  @Get('gateways')
  @AllowDuringOnboarding()
  @ApiOperation({ summary: 'Payment gateways available for checkout' })
  gatewayList() {
    return {
      available: this.gateways.configuredGateways(),
      default: this.gateways.defaultGateway,
    };
  }

  @Post('checkout')
  // Reachable during onboarding: paying the first invoice is exactly what a PENDING tenant
  // needs to do to become active.
  @AllowDuringOnboarding()
  @Permissions('subscription:upgrade')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a gateway checkout session for an invoice' })
  async checkout(
    @Body(new ZodValidationPipe(checkoutSchema))
    body: { invoiceId: string; gateway?: GatewayName },
    @IdempotencyKey() idempotencyKey: string | null,
  ) {
    return this.payments.createCheckout(
      body.invoiceId,
      body.gateway,
      idempotencyKey ?? undefined,
    );
  }

  /**
   * Confirms a checkout callback.
   *
   * The signature is verified server-side and the status re-read from the gateway, so a user
   * editing this request cannot mark an invoice paid.
   */
  @Post('checkout/confirm')
  @AllowDuringOnboarding()
  @Permissions('subscription:upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a gateway callback and settle the invoice' })
  async confirm(
    @Body(new ZodValidationPipe(confirmSchema))
    body: { gateway: GatewayName; orderId: string; paymentId: string; signature: string },
  ) {
    const result = await this.payments.confirmCheckout(
      body.gateway,
      body.orderId,
      body.paymentId,
      body.signature,
    );

    return {
      status: result.status,
      invoiceNumber: result.invoiceNumber,
      message:
        result.status === 'CAPTURED'
          ? 'Payment received. Thank you.'
          : 'Payment was not completed.',
    };
  }
}

/**
 * Development-only helper standing in for the shopper completing checkout.
 *
 * Excluded from Swagger and gated on the stub gateway being selectable at all — which
 * `env.schema.ts` forbids in production. Without something like this, the payment path could
 * not be exercised locally or in CI without live gateway credentials.
 */
@ApiTags('billing')
@Controller({ path: 'dev/payments', version: '1' })
export class DevPaymentController {
  constructor(
    private readonly stub: StubPaymentAdapter,
    private readonly payments: PaymentService,
  ) {}

  @Public()
  @Post('simulate')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  async simulate(
    @Query('orderId') orderId: string,
    @Query('succeed') succeed?: string,
  ) {
    const callback = this.stub.simulatePayment(orderId, succeed !== 'false');

    // Goes through the same confirm path the real gateway uses, signature check included —
    // so this exercises production code rather than bypassing it.
    const result = await this.payments.confirmCheckout(
      'stub',
      callback.orderId,
      callback.paymentId,
      callback.signature,
    );

    return { ...result, callback };
  }
}
