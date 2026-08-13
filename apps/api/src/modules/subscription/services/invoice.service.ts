import { Injectable, Logger } from '@nestjs/common';
import { Money, newPublicId, type CurrencyCode } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import {
  SubscriptionInvoiceEntity,
  type InvoiceLineItem,
} from '../../../database/entities';

export interface CreateInvoiceInput {
  tenantId: string;
  subscriptionId: string;
  currency: CurrencyCode;
  periodStart: Date;
  periodEnd: Date;
  lineItems: InvoiceLineItem[];
  /** Days until payment is due. Zero means due immediately. */
  dueInDays?: number;
  billingAddress?: Record<string, unknown> | null;
}

/**
 * Subscription invoicing.
 *
 * The numbering is the interesting part. Invoice numbers must be **gapless per tenant**
 * because a missing number in a tax-invoice series is a compliance problem in most
 * jurisdictions — an auditor reading `INV-2026-0001, 0002, 0004` will ask where 0003 went,
 * and "our database skipped it" is not an answer.
 *
 * That rules out `AUTO_INCREMENT`, which consumes a value even when the transaction that
 * requested it rolls back. Instead a counter row is locked with `SELECT … FOR UPDATE`
 * inside the same transaction as the insert, so the number and the invoice commit or roll
 * back together.
 *
 * The cost is that invoice creation serialises per tenant. That is fine here: a tenant
 * issues a handful of subscription invoices a year, not thousands a second.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  /**
   * Creates an invoice with the next number in the tenant's series.
   *
   * `manager` is required, not optional: the number allocation must share the caller's
   * transaction. Allocating on a separate connection would let the number commit while the
   * invoice rolls back — reintroducing exactly the gap this design exists to prevent.
   */
  async create(
    manager: EntityManager,
    input: CreateInvoiceInput,
  ): Promise<SubscriptionInvoiceEntity> {
    const invoiceNumber = await this.allocateNumber(manager, input.tenantId, input.periodStart);

    const subtotal = input.lineItems.reduce(
      (sum, line) => sum.add(Money.fromMinor(line.amountMinor, input.currency)),
      Money.zero(input.currency),
    );

    // No tax on subscription fees yet — GST handling arrives with the tax module in Phase 5.
    // Modelled explicitly as zero rather than omitted, so the totals still balance.
    const tax = Money.zero(input.currency);
    const discount = Money.zero(input.currency);
    const total = subtotal.add(tax).subtract(discount);

    const dueAt =
      input.dueInDays && input.dueInDays > 0
        ? new Date(Date.now() + input.dueInDays * 86_400_000)
        : new Date();

    // A credit-only invoice (a downgrade producing net credit) is issued already settled:
    // there is nothing to collect, and leaving it OPEN would make it look overdue forever.
    const isCredit = !total.isPositive;

    const invoice = manager.create(SubscriptionInvoiceEntity, {
      publicId: newPublicId(),
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      invoiceNumber,
      status: isCredit ? 'PAID' : 'OPEN',
      subtotalMinor: subtotal.amountMinor.toString(),
      discountMinor: discount.amountMinor.toString(),
      taxMinor: tax.amountMinor.toString(),
      totalMinor: total.amountMinor.toString(),
      amountPaidMinor: isCredit ? total.amountMinor.toString() : '0',
      amountDueMinor: isCredit ? '0' : total.amountMinor.toString(),
      currency: input.currency,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueAt: isCredit ? null : dueAt,
      paidAt: isCredit ? new Date() : null,
      lineItems: input.lineItems,
      billingAddress: input.billingAddress ?? null,
    });

    return manager.save(SubscriptionInvoiceEntity, invoice);
  }

  /**
   * Allocates the next number under a row lock.
   *
   * `INSERT … ON DUPLICATE KEY UPDATE last_number = last_number + 1` is atomic and creates
   * the counter on first use, so there is no separate initialisation path to get wrong.
   * The row lock it takes is held until the caller's transaction commits, which is what
   * serialises concurrent allocations for the same tenant.
   */
  private async allocateNumber(
    manager: EntityManager,
    tenantId: string,
    periodStart: Date,
  ): Promise<string> {
    const fiscalYear = fiscalYearFor(periodStart);

    await manager.query(
      `INSERT INTO invoice_sequences (tenant_id, series, fiscal_year, last_number)
       VALUES (?, 'SUB', ?, 1)
       ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
      [tenantId, fiscalYear],
    );

    const rows = (await manager.query(
      `SELECT last_number AS lastNumber
         FROM invoice_sequences
        WHERE tenant_id = ? AND series = 'SUB' AND fiscal_year = ?`,
      [tenantId, fiscalYear],
    )) as { lastNumber: string }[];

    const next = Number(rows[0]?.lastNumber ?? 1);

    // `SUB-2026-000001` — series, fiscal year, zero-padded sequence.
    return `SUB-${fiscalYear}-${String(next).padStart(6, '0')}`;
  }

  /**
   * Records a payment against an invoice.
   *
   * Handles partial payment explicitly: marking a half-paid invoice PAID would lose the
   * outstanding balance, and marking it OPEN would lose the money received.
   */
  async applyPayment(
    manager: EntityManager,
    invoiceId: string,
    amountMinor: string,
    currency: CurrencyCode,
  ): Promise<SubscriptionInvoiceEntity> {
    const invoice = await manager.findOne(SubscriptionInvoiceEntity, {
      where: { id: invoiceId },
    });
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    const paid = Money.fromMinor(invoice.amountPaidMinor, currency).add(
      Money.fromMinor(amountMinor, currency),
    );
    const total = Money.fromMinor(invoice.totalMinor, currency);
    const due = total.subtract(paid);

    invoice.amountPaidMinor = paid.amountMinor.toString();
    // Clamped at zero: an overpayment leaves nothing "due", and a negative due amount
    // would render as a bill for a negative number.
    invoice.amountDueMinor = due.isNegative ? '0' : due.amountMinor.toString();

    if (paid.greaterThanOrEqual(total)) {
      invoice.status = 'PAID';
      invoice.paidAt = new Date();
    } else if (paid.isPositive) {
      invoice.status = 'PARTIALLY_PAID';
    }

    return manager.save(SubscriptionInvoiceEntity, invoice);
  }

  /**
   * Voids an invoice.
   *
   * Void, never delete. A deleted invoice leaves a gap in the series, which is the one
   * thing the numbering scheme exists to prevent — a voided one keeps its number and
   * carries an explicit status.
   */
  async void(manager: EntityManager, invoiceId: string, reason: string): Promise<void> {
    await manager.query(
      `UPDATE subscription_invoices
          SET status = 'VOID', voided_at = NOW(3), amount_due_minor = 0
        WHERE id = ? AND status IN ('DRAFT','OPEN','PARTIALLY_PAID')`,
      [invoiceId],
    );

    this.logger.log(`Voided invoice ${invoiceId}: ${reason}`);
  }
}

/**
 * Indian fiscal year: April to March.
 *
 * `2026-02-15` falls in FY 2025, not 2026. Getting this wrong resets the invoice series
 * three months early and produces duplicate numbers within a single fiscal year.
 */
export function fiscalYearFor(date: Date): number {
  const year = date.getUTCFullYear();
  // getUTCMonth() is zero-based; 3 is April.
  return date.getUTCMonth() >= 3 ? year : year - 1;
}
