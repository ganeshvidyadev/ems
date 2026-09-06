import { Global, Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderItemRepository, OrderRepository, OrderStatusHistoryRepository } from './order.repository';
import { OrderService } from './order.service';
import { ReturnController } from './return.controller';
import { ReturnItemRepository, ReturnRepository } from './return.repository';
import { ReturnService } from './return.service';
import { ShipmentController } from './shipment.controller';
import { ShipmentEventRepository, ShipmentItemRepository, ShipmentRepository } from './shipment.repository';
import { ShipmentTrackingService } from './shipment-tracking.service';
import { ShipmentWebhookController } from './shipment-webhook.controller';

/** `@Global()`: checkout creates orders from outside this module's own request graph. */
@Global()
@Module({
  controllers: [OrderController, ReturnController, ShipmentController, ShipmentWebhookController],
  providers: [
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
    ShipmentRepository,
    ShipmentItemRepository,
    ShipmentEventRepository,
    ReturnRepository,
    ReturnItemRepository,
    OrderService,
    ReturnService,
    ShipmentTrackingService,
  ],
  exports: [OrderRepository, OrderItemRepository, OrderStatusHistoryRepository, OrderService],
})
export class OrderModule {}
