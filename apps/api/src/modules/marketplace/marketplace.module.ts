import { Global, Module } from '@nestjs/common';
import { CommissionController } from './commission.controller';
import { CommissionLedgerRepository } from './commission-ledger.repository';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceOrderService } from './marketplace-order.service';
import { ProductShareRepository } from './product-share.repository';
import { ProductShareService } from './product-share.service';
import { SettlementController } from './settlement.controller';
import { SettlementRepository } from './settlement.repository';
import { SettlementService } from './settlement.service';

/**
 * Global, the same way `ShippingModule`/`PaymentModule` are — `CheckoutModule`
 * injects `MarketplaceOrderService` with no import edge back to this module,
 * matching how it already reaches `InventoryService`/`ShippingCarrierFactory`.
 */
@Global()
@Module({
  controllers: [MarketplaceController, SettlementController, CommissionController],
  providers: [
    ProductShareRepository,
    CommissionLedgerRepository,
    SettlementRepository,
    MarketplaceOrderService,
    ProductShareService,
    SettlementService,
  ],
  exports: [
    ProductShareRepository,
    CommissionLedgerRepository,
    SettlementRepository,
    MarketplaceOrderService,
    ProductShareService,
    SettlementService,
  ],
})
export class MarketplaceModule {}
