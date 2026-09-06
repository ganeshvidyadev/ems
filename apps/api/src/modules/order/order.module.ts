import { Global, Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderItemRepository, OrderRepository, OrderStatusHistoryRepository } from './order.repository';
import { OrderService } from './order.service';
import { ReturnController } from './return.controller';
import { ReturnItemRepository, ReturnRepository } from './return.repository';
import { ReturnService } from './return.service';
import { ShipmentItemRepository, ShipmentRepository } from './shipment.repository';

/** `@Global()`: checkout creates orders from outside this module's own request graph. */
@Global()
@Module({
  controllers: [OrderController, ReturnController],
  providers: [
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
    ShipmentRepository,
    ShipmentItemRepository,
    ReturnRepository,
    ReturnItemRepository,
    OrderService,
    ReturnService,
  ],
  exports: [OrderRepository, OrderItemRepository, OrderStatusHistoryRepository, OrderService],
})
export class OrderModule {}
