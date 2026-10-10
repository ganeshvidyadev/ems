import { addMs } from '../dates';
import { hexFrom, sha256Hex } from '../rng';
import { Ref } from '../types';
import type { Val } from '../types';
import { type Ctx, staffEmail } from './context';
import type { CoreModel } from './core';
import type { InventoryResult } from './inventory';
import type { OrderModel } from './order-types';
import { ORIGIN_PLACEHOLDER } from './orders';

function addressSnapshot(a: OrderModel['address']): Record<string, Val> {
  return {
    recipientName: a.recipientName,
    phoneE164: a.phone,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    landmark: a.landmark,
    city: a.city,
    stateCode: a.stateCode,
    stateName: a.stateName,
    postalCode: a.postalCode,
    countryCode: 'IN',
  };
}

/** Emits the full order graph and the inventory ledger/levels. */
export function emitCommerceRows(ctx: Ctx, core: CoreModel, orders: OrderModel[], inventory: InventoryResult): void {
  const { sink, spec } = ctx;
  const storeRef = new Ref('stores', `${spec.slug}-store`);
  const userRef = (key: string): Ref => new Ref('users', staffEmail(spec, key).toLowerCase());
  const whByCode = new Map(core.warehouses.map((w) => [w.code, w] as const));

  for (const o of orders) {
    const orderRef = new Ref('orders', o.number);
    const c = o.customer;
    const snapshot = addressSnapshot(o.address);
    sink.add('orders', {
      nk: o.number,
      ts: o.createdAt,
      updatedAt: o.updatedAt,
      v: {
        store_id: storeRef,
        order_number: o.number,
        customer_id: new Ref('customers', c.emailNormalized),
        email: c.email,
        phone_e164: c.phone,
        status: o.status,
        payment_status: o.paymentStatus,
        fulfilment_status: o.fulfilmentStatus,
        currency: 'INR',
        subtotal_minor: o.subtotalMinor,
        discount_minor: o.discountMinor,
        shipping_minor: o.shippingMinor,
        tax_minor: o.taxMinor,
        cod_fee_minor: o.codFeeMinor,
        round_off_minor: 0,
        total_minor: o.totalMinor,
        amount_paid_minor: o.amountPaidMinor,
        amount_refunded_minor: o.amountRefundedMinor,
        shipping_address: snapshot,
        billing_address: snapshot,
        channel: 'WEB',
        channel_order_ref: null,
        is_marketplace_order: 0,
        reseller_tenant_id: null,
        parent_order_id: null,
        coupon_id: o.coupon ? new Ref('coupons', o.coupon.code) : null,
        coupon_code: o.coupon ? o.coupon.code : null,
        customer_note: o.customerNote,
        internal_note: o.internalNote,
        tags: o.tags,
        cancel_reason: o.cancelReason,
        cancelled_at: o.cancelledAt,
        placed_at: o.placedAt,
        confirmed_at: o.confirmedAt,
        delivered_at: o.deliveredAt,
        closed_at: o.closedAt,
        ip_address: null,
        user_agent: o.userAgent,
        utm: o.utm,
        correlation_id: null,
        version: 0,
      },
    });

    for (const line of o.lines) {
      sink.add('order_items', {
        nk: line.itemNk,
        ts: o.createdAt,
        updatedAt: o.updatedAt,
        owner: orderRef,
        v: {
          order_id: orderRef,
          product_id: new Ref('products', line.product.slug),
          variant_id: line.variant ? new Ref('product_variants', line.variant.sku) : null,
          sku: line.sku,
          name: line.name,
          variant_title: line.variantTitle,
          image_url: line.imageUrl,
          hsn_code: line.hsn,
          quantity: line.qty,
          unit_price_minor: line.unitMinor,
          unit_cost_minor: line.costMinor,
          line_subtotal_minor: line.subtotalMinor,
          line_discount_minor: line.discountMinor,
          tax_rate: line.taxRate,
          line_tax_minor: line.taxMinor,
          line_total_minor: line.totalMinor,
          tax_breakup: line.taxBreakup.length > 0 ? line.taxBreakup : null,
          quantity_fulfilled: line.qtyFulfilled,
          quantity_returned: line.qtyReturned,
          quantity_cancelled: line.qtyCancelled,
          warehouse_id: line.allocations[0] ? new Ref('warehouses', line.allocations[0].warehouse) : null,
          stock_allocations: line.allocations.map((a) => ({ warehouseId: new Ref('warehouses', a.warehouse), quantity: a.qty })),
          supplier_tenant_id: null,
          commission_rate: null,
          commission_minor: null,
          properties: null,
        },
      });
    }

    o.history
      .slice()
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .forEach((h, n) => {
        sink.add('order_status_history', {
          nk: `${o.number}|${n + 1}`,
          ts: h.at,
          owner: orderRef,
          v: {
            order_id: orderRef,
            status_type: h.type,
            from_status: h.from,
            to_status: h.to,
            reason: h.reason,
            actor_type: h.actor,
            actor_id: h.actor === 'USER' && h.staffKey ? userRef(h.staffKey) : h.actor === 'CUSTOMER' ? null : null,
            metadata: null,
            correlation_id: null,
          },
        });
      });

    for (const p of o.payments) {
      const online = p.gateway === 'STUB';
      sink.add('payments', {
        nk: p.nk,
        ts: p.createdAt,
        updatedAt: p.updatedAt,
        owner: orderRef,
        v: {
          store_id: storeRef,
          order_id: orderRef,
          subscription_invoice_id: null,
          gateway: p.gateway,
          method: p.method,
          status: p.status,
          amount_minor: p.amountMinor,
          currency: 'INR',
          amount_captured_minor: p.capturedMinor,
          amount_refunded_minor: p.refundedMinor,
          gateway_fee_minor: p.feeMinor,
          gateway_tax_minor: p.feeTaxMinor,
          net_settlement_minor: p.netMinor,
          gateway_payment_id: p.gatewayPaymentId,
          gateway_order_id: p.gatewayOrderId,
          gateway_signature: null,
          card_last4: p.cardLast4,
          card_brand: p.cardBrand,
          card_network: p.cardNetwork,
          upi_vpa: p.upiVpa,
          bank_name: p.bankName,
          idempotency_key: sha256Hex(`seed|${spec.slug}|payment|${p.nk}`),
          error_code: p.errorCode,
          error_message: p.errorMessage,
          gateway_response: !online
            ? null
            : p.status === 'PENDING'
              ? { clientPayload: { gateway: 'stub', orderId: p.gatewayOrderId, amount: p.amountMinor, currency: 'INR', completeUrl: `/api/v1/webhooks/stub/complete?orderId=${p.gatewayOrderId}` } }
              : { gateway: 'stub', reference: o.number, method: p.method },
          authorized_at: null,
          captured_at: p.capturedAt,
          failed_at: p.failedAt,
          reconciled_at: p.reconciledAt,
          correlation_id: null,
          version: 0,
        },
      });
    }

    for (const r of o.refunds) {
      const payment = o.payments.find((p) => p.nk === r.paymentNk)!;
      sink.add('refunds', {
        nk: r.nk,
        ts: r.at,
        owner: orderRef,
        v: {
          payment_id: new Ref('payments', r.paymentNk),
          order_id: orderRef,
          return_id: r.returnRma ? new Ref('returns', r.returnRma) : null,
          amount_minor: r.amountMinor,
          currency: 'INR',
          reason: r.reason,
          status: r.status,
          gateway_refund_id: payment.gateway === 'STUB' ? `stub_rfnd_${hexFrom(`${spec.slug}|${r.nk}`, 16)}` : null,
          idempotency_key: sha256Hex(`seed|${spec.slug}|refund|${r.nk}`),
          speed: 'NORMAL',
          requested_by: userRef('orders'),
          approved_by: userRef('admin'),
          gateway_response: payment.gateway === 'STUB' ? { gateway: 'stub' } : null,
          processed_at: r.at,
        },
      });
    }

    for (const s of o.shipments) {
      // Dispatch from the warehouse that actually holds the stock for the first shipped line.
      const wh = whByCode.get(s.items[0]?.line.allocations[0]?.warehouse ?? s.warehouse) ?? core.warehouses[0]!;
      sink.add('shipments', {
        nk: s.number,
        ts: s.createdAt,
        updatedAt: s.updatedAt,
        owner: orderRef,
        v: {
          order_id: orderRef,
          warehouse_id: new Ref('warehouses', wh.code),
          shipment_number: s.number,
          carrier: 'STUB',
          carrier_service: s.service,
          awb_number: s.awb,
          tracking_url: `https://stub-carrier.test/track/${s.awb}`,
          status: s.status,
          weight_grams: s.weightG,
          length_mm: null,
          width_mm: null,
          height_mm: null,
          shipping_cost_minor: s.costMinor,
          cod_amount_minor: s.codAmountMinor,
          is_cod: s.isCod ? 1 : 0,
          label_url: `https://stub-carrier.test/label/${s.awb}.pdf`,
          manifest_url: null,
          invoice_url: null,
          from_address: { name: wh.model.name, addressLine1: wh.model.line1, city: wh.model.city, stateCode: wh.model.stateCode, postalCode: wh.model.postal, countryCode: 'IN' },
          to_address: snapshot,
          pickup_scheduled_at: addMs(s.createdAt, 3_600_000),
          picked_up_at: s.pickedUpAt && s.events.some((e) => e.status === 'PICKED_UP') ? s.pickedUpAt : null,
          shipped_at: s.shippedAt,
          expected_delivery_at: s.expectedDeliveryAt,
          delivered_at: s.deliveredAt,
          rto_initiated_at: s.rtoInitiatedAt,
          carrier_response: { awbNumber: s.awb, reference: o.number, service: s.service },
          last_sync_at: s.updatedAt,
        },
      });
      for (const item of s.items) {
        sink.add('shipment_items', {
          nk: `${s.number}|${item.line.sku}`,
          ts: s.createdAt,
          owner: orderRef,
          v: { shipment_id: new Ref('shipments', s.number), order_item_id: new Ref('order_items', item.line.itemNk), quantity: item.qty },
        });
      }
      s.events.forEach((e, n) => {
        sink.add('shipment_events', {
          nk: `${s.number}|${n + 1}`,
          ts: e.at,
          owner: orderRef,
          v: {
            shipment_id: new Ref('shipments', s.number),
            status: e.status,
            carrier_status_code: `STUB_${e.status}`,
            description: e.description,
            location: e.location === ORIGIN_PLACEHOLDER ? `${wh.model.city} warehouse` : e.location,
            event_at: e.at,
            event_hash: sha256Hex(`${spec.slug}|${s.number}|${e.status}|${e.at.toISOString()}`),
            raw_payload: null,
          },
        });
      });
    }

    for (const r of o.returns) {
      const last = [r.completedAt, r.inspectedAt, r.receivedAt, r.approvedAt, r.createdAt].find((d): d is Date => d !== null) as Date;
      sink.add('returns', {
        nk: r.rma,
        ts: r.createdAt,
        updatedAt: last,
        owner: orderRef,
        v: {
          order_id: orderRef,
          customer_id: new Ref('customers', c.emailNormalized),
          rma_number: r.rma,
          type: 'RETURN',
          status: r.status,
          reason: r.reason,
          reason_detail: r.reasonDetail,
          customer_images: null,
          refund_amount_minor: r.refundMinor,
          restocking_fee_minor: r.restockingFeeMinor,
          return_shipment_id: null,
          approved_by: r.approvedAt ? userRef('orders') : null,
          approved_at: r.approvedAt,
          rejected_reason: r.rejectedReason,
          received_at: r.receivedAt,
          inspected_at: r.inspectedAt,
          inspection_result: r.inspection,
          completed_at: r.completedAt,
        },
      });
      for (const item of r.items) {
        sink.add('return_items', {
          nk: `${r.rma}|${item.line.sku}`,
          ts: r.createdAt,
          owner: orderRef,
          v: {
            return_id: new Ref('returns', r.rma),
            order_item_id: new Ref('order_items', item.line.itemNk),
            quantity: item.qty,
            condition_note: item.note,
            restock: item.restock ? 1 : 0,
            refund_minor: item.refundMinor,
          },
        });
      }
    }
  }

  // --- Inventory levels and ledger ---------------------------------------------------------------
  for (const l of inventory.levels) {
    sink.add('inventory_levels', {
      nk: l.nk,
      ts: l.createdAt,
      updatedAt: l.lastCountedAt ?? l.createdAt,
      v: {
        warehouse_id: new Ref('warehouses', l.warehouse),
        product_id: new Ref('products', l.product.slug),
        variant_id: l.variant ? new Ref('product_variants', l.variant.sku) : null,
        quantity_on_hand: l.onHand,
        quantity_reserved: l.reserved,
        quantity_incoming: l.incoming,
        reorder_point: l.reorderPoint,
        reorder_quantity: l.reorderQty,
        bin_location: l.bin,
        last_counted_at: l.lastCountedAt,
        version: 0,
      },
    });
  }
  for (const m of inventory.movements) {
    const reference = m.refOrder ? new Ref('orders', m.refOrder) : m.refShipment ? new Ref('shipments', m.refShipment) : m.refReturn ? new Ref('returns', m.refReturn) : null;
    sink.add('inventory_movements', {
      nk: m.nk,
      ts: m.ts,
      owner: m.ownerOrder ? new Ref('orders', m.ownerOrder) : new Ref('inventory_levels', m.ownerLevel),
      v: {
        warehouse_id: new Ref('warehouses', m.warehouse),
        product_id: new Ref('products', m.product.slug),
        variant_id: m.variant ? new Ref('product_variants', m.variant.sku) : null,
        type: m.type,
        quantity_delta: m.delta,
        quantity_after: m.after,
        reference_type: m.refType,
        reference_id: reference,
        unit_cost_minor: m.unitCostMinor,
        reason: m.reason,
        performed_by: m.performedByStaff ? userRef(m.performedByStaff) : null,
        correlation_id: null,
      },
    });
  }

  // --- Order-number allocator ---------------------------------------------------------------------
  sink.add('order_sequences', { nk: 'sequence', ts: ctx.now, v: { last_number: orders.length } });
}
