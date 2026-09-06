import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Money, type CurrencyCode } from '@ems/kernel';
import { RequestContextService } from '../../common/services/request-context.service';
import { OrderEntity, OrderItemEntity, type CommissionLedgerEntity } from '../../database/entities';
import { OrderItemRepository, OrderRepository } from '../order/order.repository';
import { calculateCommission } from './commission-calculator';
import { buildReversalLedgerEntries, buildSaleLedgerEntries } from './ledger-entry.builder';
import { CommissionLedgerRepository } from './commission-ledger.repository';
import { ProductShareRepository } from './product-share.repository';
import { runAsTenant } from './run-as-tenant.util';

interface MarketplaceLine {
  item: OrderItemEntity;
  supplierTenantId: string;
}

@Injectable()
export class MarketplaceOrderService {
  private readonly logger = new Logger(MarketplaceOrderService.name);

  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly orders: OrderRepository,
    private readonly orderItems: OrderItemRepository,
    private readonly productShares: ProductShareRepository,
    private readonly commissionLedger: CommissionLedgerRepository,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Splits a just-confirmed order into per-supplier sub-orders and writes
   * the commission ledger. Safe to call for any confirmed order — it reads
   * the order's own items to decide whether there is anything to do, so
   * both of checkout's confirmation paths (`commitOrderConfirmed` and
   * `settleAndConfirm`) can call it unconditionally.
   *
   * Idempotent: an item whose `commissionMinor` is already set has already
   * been processed (by the other confirmation path, or a retried job), and
   * is skipped rather than double-counted.
   */
  async processConfirmedOrder(tx: EntityManager, orderId: string): Promise<void> {
    const ordersRepo = this.orders.withManager(tx);
    const orderItemsRepo = this.orderItems.withManager(tx);

    const order = await ordersRepo.findOneOrFail({ where: { id: orderId } });
    const items = await orderItemsRepo.findByOrder(orderId);

    const pending: MarketplaceLine[] = items
      .filter((item) => item.supplierTenantId && item.commissionMinor === null)
      .map((item) => ({ item, supplierTenantId: item.supplierTenantId! }));

    if (pending.length === 0) return;

    const currency = order.currency as CurrencyCode;
    const resellerTenantId = order.tenantId;
    const correlationId = this.context.correlationId ?? null;

    const bySupplier = groupBy(pending, (line) => line.supplierTenantId);
    const ledgerEntries: Partial<CommissionLedgerEntity>[] = [];

    for (const [supplierTenantId, lines] of bySupplier) {
      const priced = await Promise.all(
        lines.map(async ({ item }) => {
          const share = await this.productShares.findExisting(supplierTenantId, resellerTenantId, item.productId!);
          if (!share) {
            // The share was revoked between checkout and confirmation. The sale still
            // happened — the customer paid — so it is honoured, at 0% commission and
            // 0% platform fee, rather than left in limbo. Logged for manual review.
            this.logger.warn(
              `Order ${orderId} item ${item.id}: no active share found for supplier ${supplierTenantId}; ` +
                `settling with 0% commission/fee`,
            );
          }

          const gross = Money.fromMinor(item.lineSubtotalMinor, currency).subtract(
            Money.fromMinor(item.lineDiscountMinor, currency),
          );

          const supplierCostBasis =
            share?.commissionType === 'MARGIN' ? await this.supplierBasePrice(item.productId!, item.quantity, currency) : null;

          const result = calculateCommission({
            commissionType: share?.commissionType ?? 'PERCENTAGE',
            commissionValue: share?.commissionValue ?? '0',
            platformFeeRate: share?.platformFeeRate ?? '0',
            gross,
            quantity: item.quantity,
            supplierCostBasis,
          });

          return { item, gross, ...result };
        }),
      );

      for (const { item, resellerCommission, platformFee, supplierNet, gross } of priced) {
        await orderItemsRepo.update(
          { id: item.id },
          {
            commissionMinor: resellerCommission.amountMinor.toString(),
            commissionRate: commissionRateOf(resellerCommission, gross),
          },
        );

        ledgerEntries.push(
          ...buildSaleLedgerEntries({
            orderId,
            orderItemId: item.id,
            supplierTenantId,
            resellerTenantId,
            gross,
            resellerCommission,
            platformFee,
            supplierNet,
            correlationId,
          }),
        );
      }

      const supplierTotals = priced.reduce(
        (acc, p) => ({ net: acc.net.add(p.supplierNet), gross: acc.gross.add(p.gross) }),
        { net: Money.zero(currency), gross: Money.zero(currency) },
      );

      await this.createSupplierSubOrder(tx, {
        supplierTenantId,
        resellerTenantId,
        parentOrderId: orderId,
        parentOrderNumber: order.orderNumber,
        currency,
        lines: priced.map((p) => p.item),
        netPayable: supplierTotals.net,
      });
    }

    await this.commissionLedger.withManager(tx).insertMany(ledgerEntries);
  }

  /**
   * Proportional reversal for a refund against a marketplace order.
   *
   * The proportion is `min(refundAmount, marketplaceGross) / marketplaceGross`
   * — capped at the order's own marketplace merchandise value, so a refund
   * that also covers shipping/tax (never part of these ledger rows) never
   * over-reverses. Multiple partial refunds against the same order are each
   * computed fresh against the *original* sale entries rather than tracking
   * a running remaining-to-reverse balance — a documented simplification,
   * not a silent one.
   */
  async reverseForRefund(tx: EntityManager, orderId: string, refundAmountMinor: string): Promise<void> {
    const originals = (await this.commissionLedger.withManager(tx).findByOrder(orderId)).filter(
      (e) => e.entryType !== 'REFUND_REVERSAL',
    );
    if (originals.length === 0) return;

    const marketplaceGross = originals
      .filter((e) => e.direction === 'DEBIT')
      .reduce((sum, e) => sum + BigInt(e.netMinor), 0n);
    if (marketplaceGross <= 0n) return;

    const refund = BigInt(refundAmountMinor);
    const numerator = refund < marketplaceGross ? refund : marketplaceGross;

    const reversals = buildReversalLedgerEntries(originals, { numerator, denominator: marketplaceGross }, this.context.correlationId ?? null);
    await this.commissionLedger.withManager(tx).insertMany(reversals);
  }

  private async supplierBasePrice(productId: string, quantity: number, currency: CurrencyCode): Promise<Money> {
    const rows = (await this.manager.query(`SELECT price_minor AS priceMinor FROM products WHERE id = ? LIMIT 1`, [
      productId,
    ])) as { priceMinor: string }[];
    const priceMinor = rows[0]?.priceMinor ?? '0';
    return Money.fromMinor(priceMinor, currency).multiplyByQuantity(quantity);
  }

  /**
   * Creates the supplier's own order for their share of a marketplace sale —
   * from the supplier's side, indistinguishable from any other order in
   * their tenant. Their existing order/shipment fulfilment pipeline (built
   * in Phase 5/6) takes it from here, inventory reservation included; this
   * method deliberately does none of that itself.
   */
  private async createSupplierSubOrder(
    tx: EntityManager,
    params: {
      supplierTenantId: string;
      resellerTenantId: string;
      parentOrderId: string;
      parentOrderNumber: string;
      currency: string;
      lines: OrderItemEntity[];
      netPayable: Money;
    },
  ): Promise<void> {
    const { supplierTenantId, resellerTenantId, parentOrderId, parentOrderNumber, currency, lines, netPayable } = params;

    await runAsTenant(this.context, supplierTenantId, async () => {
      const ordersRepo = this.orders.withManager(tx);
      const orderItemsRepo = this.orderItems.withManager(tx);

      const storeRows = (await tx.query(`SELECT id FROM stores WHERE tenant_id = ? ORDER BY id ASC LIMIT 1`, [
        supplierTenantId,
      ])) as { id: string }[];
      const storeId = storeRows[0]?.id;
      if (!storeId) {
        this.logger.error(`Supplier ${supplierTenantId} has no store to route order ${parentOrderId} into; skipping sub-order`);
        return;
      }

      const orderNumber = await ordersRepo.nextOrderNumber(tx);
      const subtotal = lines.reduce(
        (sum, item) => sum.add(Money.fromMinor(item.lineSubtotalMinor, currency as CurrencyCode)),
        Money.zero(currency as CurrencyCode),
      );

      const subOrder = await ordersRepo.insert({
        storeId,
        orderNumber,
        customerId: null,
        status: 'CONFIRMED',
        // Guaranteed, not pending: the reseller already collected the customer's
        // payment in full, and owes this supplier `netPayable` via settlement —
        // that obligation exists whether or not the supplier has shipped yet.
        paymentStatus: 'PAID',
        fulfilmentStatus: 'UNFULFILLED',
        currency,
        subtotalMinor: subtotal.amountMinor.toString(),
        totalMinor: netPayable.amountMinor.toString(),
        amountPaidMinor: netPayable.amountMinor.toString(),
        channel: 'API',
        isMarketplaceOrder: true,
        resellerTenantId,
        parentOrderId,
        placedAt: new Date(),
        confirmedAt: new Date(),
        internalNote: `Routed from order ${parentOrderNumber} (reseller tenant ${resellerTenantId})`,
      } as Partial<OrderEntity>);

      for (const item of lines) {
        await orderItemsRepo.insert({
          orderId: subOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          name: item.name,
          variantTitle: item.variantTitle,
          imageUrl: item.imageUrl,
          hsnCode: item.hsnCode,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineSubtotalMinor: item.lineSubtotalMinor,
          lineDiscountMinor: '0',
          lineTotalMinor: item.lineSubtotalMinor,
        } as Partial<OrderItemEntity>);
      }
    });
  }

}

function commissionRateOf(commission: Money, gross: Money): string {
  if (gross.isZero) return '0';
  // Stored for display only (`order_items.commission_rate`) — derived from the
  // two already-computed minor-unit amounts rather than re-deriving it from
  // the share's own config, so it always agrees with `commission_minor` even
  // for FIXED/MARGIN types that were never a percentage to begin with.
  const percentTimes10000 = (commission.amountMinor * 1_000_000n) / gross.amountMinor;
  return (Number(percentTimes10000) / 10_000).toFixed(4);
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
