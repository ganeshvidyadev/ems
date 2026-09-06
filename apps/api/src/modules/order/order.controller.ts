import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  cancelOrderRequestSchema,
  fulfilOrderRequestSchema,
  holdOrderRequestSchema,
  orderListQuerySchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrderService } from './order.service';

@ApiTags('orders')
@Controller({ path: 'console/orders', version: '1' })
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @Permissions('order:read')
  @ApiOperation({ summary: 'List orders' })
  async list(
    @Query(new ZodValidationPipe(orderListQuerySchema))
    query: ReturnType<typeof orderListQuerySchema.parse>,
  ) {
    const { items, total } = await this.orders.list({
      page: query.page,
      limit: query.limit,
      filter: {
        storeId: query.storeId,
        customerId: query.customerId,
        status: query.status,
        paymentStatus: query.paymentStatus,
        fulfilmentStatus: query.fulfilmentStatus,
      },
      sort: query.sort,
    });
    return new Paginated(
      await Promise.all(items.map((o) => this.orders.toResponse(o))),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get(':id')
  @Permissions('order:read')
  @ApiOperation({ summary: 'Get an order, including its timeline' })
  async get(@Param('id') id: string) {
    const order = await this.orders.getByPublicId(id);
    return this.orders.toResponse(order, true);
  }

  @Post(':id/cancel')
  @Permissions('order:cancel')
  @Validate(cancelOrderRequestSchema)
  @ApiOperation({ summary: 'Cancel an order, restocking or releasing its inventory' })
  async cancel(@Param('id') id: string, @Body() body: ReturnType<typeof cancelOrderRequestSchema.parse>) {
    return this.orders.toResponse(await this.orders.cancel(id, body.reason));
  }

  @Post(':id/hold')
  @Permissions('order:update')
  @Validate(holdOrderRequestSchema)
  @ApiOperation({ summary: 'Put an order on hold' })
  async hold(@Param('id') id: string, @Body() body: ReturnType<typeof holdOrderRequestSchema.parse>) {
    return this.orders.toResponse(await this.orders.hold(id, body.reason));
  }

  @Post(':id/resume')
  @Permissions('order:update')
  @ApiOperation({ summary: 'Resume an order that was on hold' })
  async resume(@Param('id') id: string) {
    return this.orders.toResponse(await this.orders.resume(id));
  }

  @Post(':id/fulfil')
  @Permissions('order:fulfil')
  @Validate(fulfilOrderRequestSchema)
  @ApiOperation({ summary: 'Fulfil some or all of the open items on an order' })
  async fulfil(@Param('id') id: string, @Body() body: ReturnType<typeof fulfilOrderRequestSchema.parse>) {
    return this.orders.toResponse(await this.orders.fulfil(id, body));
  }

  @Post(':id/close')
  @Permissions('order:update')
  @ApiOperation({ summary: 'Close a fully-fulfilled order' })
  async close(@Param('id') id: string) {
    return this.orders.toResponse(await this.orders.close(id));
  }
}
