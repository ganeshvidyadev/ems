import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  requestReturnRequestSchema,
  type RequestReturnRequest,
} from '@ems/contracts';
import { CustomerAuth, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { RequestContextService } from '../../common/services/request-context.service';
import { OrderService } from './order.service';
import { ReturnService } from './return.service';
import { ReturnRepository } from './return.repository';

@ApiTags('storefront-orders')
@CustomerAuth()
@Controller({ path: 'storefront/account', version: '1' })
export class OrderStorefrontController {
  constructor(
    private readonly orders: OrderService,
    private readonly returns: ReturnService,
    private readonly returnRepository: ReturnRepository,
    private readonly context: RequestContextService,
  ) {}

  private getRequiredCustomerId(): string {
    const customerId = this.context.customerId;
    if (!customerId) throw new UnauthorizedException('Customer authentication required');
    return customerId;
  }

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  @Get('orders')
  @ApiOperation({ summary: "List current customer's orders" })
  async listOrders(
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const customerId = this.getRequiredCustomerId();
    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitStr) || 20));

    const { items, total } = await this.orders.list({
      page,
      limit,
      filter: { customerId },
      sort: [{ field: 'createdAt', direction: 'DESC' }],
    });

    const responseItems = await Promise.all(items.map((o) => this.orders.toResponse(o)));
    return new Paginated(responseItems, buildPaginationMeta(page, limit, total));
  }

  @Get('orders/:id')
  @ApiOperation({ summary: "Get details for an order belonging to current customer" })
  async getOrder(@Param('id') publicId: string) {
    const customerId = this.getRequiredCustomerId();
    const order = await this.orders.getByPublicId(publicId);

    if (order.customerId !== customerId) {
      // Return 404 so existence of another customer's order is not leaked
      throw new NotFoundException(`Order '${publicId}' not found`);
    }

    return this.orders.toResponse(order, true);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel an order belonging to current customer" })
  async cancelOrder(
    @Param('id') publicId: string,
    @Body() body?: { reason?: string },
  ) {
    const customerId = this.getRequiredCustomerId();
    const order = await this.orders.getByPublicId(publicId);

    if (order.customerId !== customerId) {
      throw new NotFoundException(`Order '${publicId}' not found`);
    }

    const updated = await this.orders.cancel(publicId, body?.reason ?? 'Customer requested cancellation');
    return this.orders.toResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Returns (RMA)
  // ---------------------------------------------------------------------------

  @Post('orders/:id/returns')
  @Validate(requestReturnRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit a return request for an eligible order" })
  async requestReturn(
    @Param('id') publicId: string,
    @Body() body: RequestReturnRequest,
  ) {
    const customerId = this.getRequiredCustomerId();
    const order = await this.orders.getByPublicId(publicId);

    if (order.customerId !== customerId) {
      throw new NotFoundException(`Order '${publicId}' not found`);
    }

    const rma = await this.returns.request(publicId, body);
    return this.returns.toResponse(rma);
  }

  @Get('returns')
  @ApiOperation({ summary: "List return requests for current customer" })
  async listReturns() {
    const customerId = this.getRequiredCustomerId();
    const rows = await this.returnRepository.findByCustomer(customerId);
    return Promise.all(rows.map((r) => this.returns.toResponse(r)));
  }

  @Get('returns/:id')
  @ApiOperation({ summary: "Get details for a return request belonging to current customer" })
  async getReturn(@Param('id') publicId: string) {
    const customerId = this.getRequiredCustomerId();
    const rma = await this.returns.getByPublicId(publicId);

    if (rma.customerId !== customerId) {
      throw new NotFoundException(`Return '${publicId}' not found`);
    }

    return this.returns.toResponse(rma);
  }
}
