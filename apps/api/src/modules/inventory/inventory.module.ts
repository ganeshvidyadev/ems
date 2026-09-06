import { Global, Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryLevelRepository, InventoryMovementRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

/**
 * `@Global()`: checkout's reservation step and the order-cancellation restock
 * path both call `InventoryService` from outside this module's own request
 * graph (checkout module, order module, and — later — a BullMQ reservation-
 * expiry processor), the same reasoning `ProductModule` documents for itself.
 */
@Global()
@Module({
  controllers: [InventoryController],
  providers: [InventoryLevelRepository, InventoryMovementRepository, InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
