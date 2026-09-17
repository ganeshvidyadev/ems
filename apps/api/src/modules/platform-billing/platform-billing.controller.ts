import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adjustInvoiceRequestSchema,
  platformInvoiceListQuerySchema,
  refundPaymentRequestSchema,
  type AdjustInvoiceRequest,
  type RefundPaymentRequest,
} from '@ems/contracts';
import { buildPaginationMeta } from '@ems/contracts';
import { CurrentUser, Permissions, Validate, type AuthenticatedUser } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformBillingService } from './platform-billing.service';

function actorFrom(user: AuthenticatedUser, request: Request) {
  return { id: user.id, publicId: user.publicId, ip: request.ip, userAgent: request.headers['user-agent'] };
}

@ApiTags('platform-billing')
@Controller({ path: 'platform/billing', version: '1' })
export class PlatformBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Get('invoices')
  @Permissions('platform.billing:read')
  @ApiOperation({ summary: 'Every tenant\'s subscription invoices' })
  async list(
    @Query(new ZodValidationPipe(platformInvoiceListQuerySchema))
    query: ReturnType<typeof platformInvoiceListQuerySchema.parse>,
  ) {
    const { items, total } = await this.billing.list(query);
    return new Paginated(items, buildPaginationMeta(query.page, query.limit, total));
  }

  @Get('invoices/:id')
  @Permissions('platform.billing:read')
  @ApiOperation({ summary: 'Get one invoice, with its payments' })
  get(@Param('id') id: string) {
    return this.billing.get(id);
  }

  @Post('invoices/:id/adjust')
  @Permissions('platform.billing:adjust')
  @Validate(adjustInvoiceRequestSchema)
  @ApiOperation({ summary: 'Add a manual credit or charge line to an open invoice' })
  adjust(
    @Param('id') id: string,
    @Body() body: AdjustInvoiceRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.billing.adjust(id, body, actorFrom(user, request));
  }

  @Post('invoices/:invoiceId/payments/:paymentId/refund')
  @Permissions('platform.billing:refund')
  @Validate(refundPaymentRequestSchema)
  @ApiOperation({ summary: "Record a full refund of one payment on the platform's own ledger" })
  refund(
    @Param('invoiceId') invoiceId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: RefundPaymentRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.billing.refundPayment(invoiceId, paymentId, body.reason, actorFrom(user, request));
  }
}
