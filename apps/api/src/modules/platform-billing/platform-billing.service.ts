import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessRuleError, Money, NotFoundError, type CurrencyCode } from '@ems/kernel';
import type {
  AdjustInvoiceRequest,
  PlatformDunningResponse,
  PlatformInvoiceListQuery,
  PlatformInvoiceResponse,
} from '@ems/contracts';
import {
  SubscriptionInvoiceEntity,
  SubscriptionPaymentEntity,
  TenantEntity,
  UserEntity,
} from '../../database/entities';
import type { AuditActor } from '../platform-tenant/platform-tenant.service';

export interface PlatformInvoiceList {
  items: PlatformInvoiceResponse[];
  total: number;
}

@Injectable()
export class PlatformBillingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: PlatformInvoiceListQuery): Promise<PlatformInvoiceList> {
    const qb = this.dataSource.getRepository(SubscriptionInvoiceEntity).createQueryBuilder('i');

    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.tenantId) {
      const tenant = await this.dataSource
        .getRepository(TenantEntity)
        .findOne({ where: { publicId: query.tenantId } });
      if (!tenant) return { items: [], total: 0 };
      qb.andWhere('i.tenant_id = :tenantId', { tenantId: tenant.id });
    }

    qb.orderBy('i.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [invoices, total] = await qb.getManyAndCount();
    const items = await Promise.all(invoices.map((i) => this.toResponse(i)));
    return { items, total };
  }

  async get(publicId: string): Promise<PlatformInvoiceResponse> {
    return this.toResponse(await this.findOrFail(publicId));
  }

  /**
   * Adds a manual line item to a still-open invoice and recomputes totals.
   *
   * Negative `amountMinor` issues a credit (a goodwill adjustment, an SLA
   * refund credited forward); positive adds a charge. Reuses `proration` on
   * the line the same way a prorated plan-change credit does — both are
   * "not from the metered billing period, added by hand" lines.
   */
  async adjust(publicId: string, input: AdjustInvoiceRequest, actor: AuditActor): Promise<PlatformInvoiceResponse> {
    const invoice = await this.findOrFail(publicId);
    if (invoice.status !== 'DRAFT' && invoice.status !== 'OPEN' && invoice.status !== 'PARTIALLY_PAID') {
      throw new BusinessRuleError(`Cannot adjust an invoice in status ${invoice.status}`);
    }

    const currency = invoice.currency as CurrencyCode;
    const amount = Money.fromMinor(input.amountMinor, currency);

    invoice.lineItems = [
      ...invoice.lineItems,
      {
        description: input.description,
        quantity: 1,
        unitAmountMinor: amount.amountMinor.toString(),
        amountMinor: amount.amountMinor.toString(),
        proration: true,
      },
    ];

    const total = Money.fromMinor(invoice.totalMinor, currency).add(amount);
    const paid = Money.fromMinor(invoice.amountPaidMinor, currency);
    const due = total.subtract(paid);

    invoice.totalMinor = total.amountMinor.toString();
    invoice.amountDueMinor = due.isNegative ? '0' : due.amountMinor.toString();
    if (amount.isNegative) {
      invoice.discountMinor = Money.fromMinor(invoice.discountMinor, currency)
        .add(amount.negate())
        .amountMinor.toString();
    }

    await this.dataSource.getRepository(SubscriptionInvoiceEntity).save(invoice);
    await this.audit(actor, 'invoice.adjusted', invoice.id, {
      severity: 'CRITICAL',
      after: { description: input.description, amountMinor: input.amountMinor },
    });

    return this.toResponse(invoice);
  }

  /**
   * Records a full refund of one payment.
   *
   * No payment gateway is wired for subscription billing (unlike order
   * payments — see `OrderPaymentService.refund`, which actually calls out to
   * one) — this only updates our own ledger. Actually returning the tenant's
   * money still requires the same manual step order refunds needed before
   * gateway integration existed.
   */
  async refundPayment(invoicePublicId: string, paymentPublicId: string, reason: string, actor: AuditActor): Promise<PlatformInvoiceResponse> {
    const invoice = await this.findOrFail(invoicePublicId);
    const payment = await this.dataSource
      .getRepository(SubscriptionPaymentEntity)
      .findOne({ where: { publicId: paymentPublicId } });
    if (!payment) throw new NotFoundError('Payment', paymentPublicId);
    if (payment.status !== 'CAPTURED') {
      throw new BusinessRuleError(`Cannot refund a payment in status ${payment.status}`);
    }

    const currency = invoice.currency as CurrencyCode;
    payment.status = 'REFUNDED';
    await this.dataSource.getRepository(SubscriptionPaymentEntity).save(payment);

    const paid = Money.fromMinor(invoice.amountPaidMinor, currency).subtract(
      Money.fromMinor(payment.amountMinor, currency),
    );
    invoice.amountPaidMinor = paid.isNegative ? '0' : paid.amountMinor.toString();
    const total = Money.fromMinor(invoice.totalMinor, currency);
    invoice.amountDueMinor = total.subtract(Money.fromMinor(invoice.amountPaidMinor, currency)).amountMinor.toString();
    invoice.status = 'REFUNDED';
    await this.dataSource.getRepository(SubscriptionInvoiceEntity).save(invoice);

    await this.audit(actor, 'invoice.payment_refunded', invoice.id, {
      severity: 'CRITICAL',
      after: { paymentId: payment.id, amountMinor: payment.amountMinor, reason },
    });

    return this.toResponse(invoice);
  }

  private async findOrFail(publicId: string): Promise<SubscriptionInvoiceEntity> {
    const invoice = await this.dataSource
      .getRepository(SubscriptionInvoiceEntity)
      .findOne({ where: { publicId } });
    if (!invoice) throw new NotFoundError('Invoice', publicId);
    return invoice;
  }

  private async toResponse(invoice: SubscriptionInvoiceEntity): Promise<PlatformInvoiceResponse> {
    const [tenant, payments] = await Promise.all([
      this.dataSource.getRepository(TenantEntity).findOne({ where: { id: invoice.tenantId } }),
      this.dataSource.getRepository(SubscriptionPaymentEntity).find({ where: { invoiceId: invoice.id } }),
    ]);

    return {
      id: invoice.publicId,
      tenantId: tenant?.publicId ?? '',
      tenantName: tenant?.businessName ?? 'Unknown',
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor,
      amountPaidMinor: invoice.amountPaidMinor,
      amountDueMinor: invoice.amountDueMinor,
      currency: invoice.currency,
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: invoice.periodEnd.toISOString(),
      dueAt: invoice.dueAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      voidedAt: invoice.voidedAt?.toISOString() ?? null,
      lineItems: invoice.lineItems,
      payments: payments.map((p) => ({
        id: p.publicId,
        gateway: p.gateway,
        status: p.status,
        amountMinor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        capturedAt: p.capturedAt?.toISOString() ?? null,
        failedAt: p.failedAt?.toISOString() ?? null,
      })),
      createdAt: invoice.createdAt.toISOString(),
    };
  }

  private async audit(
    actor: AuditActor,
    action: string,
    entityId: string,
    options: { severity: 'INFO' | 'WARNING' | 'CRITICAL'; after?: Record<string, unknown> },
  ): Promise<void> {
    const actorRow = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: actor.id } });

    await this.dataSource.query(
      `INSERT INTO audit_logs
         (tenant_id, actor_type, actor_id, actor_email, action, entity_type, entity_id,
          before_state, after_state, changed_fields, ip_address, user_agent, correlation_id, severity)
       VALUES (?, 'PLATFORM_ADMIN', ?, ?, ?, 'SubscriptionInvoice', ?, NULL, ?, ?, NULL, ?, NULL, ?)`,
      [
        null,
        actor.id,
        actorRow?.email ?? null,
        action,
        entityId,
        options.after ? JSON.stringify(options.after) : null,
        options.after ? JSON.stringify(Object.keys(options.after)) : null,
        actor.userAgent ?? null,
        options.severity,
      ],
    );
  }

  async dunningOverview(): Promise<PlatformDunningResponse> {
    const rows = (await this.dataSource.query(
      `SELECT s.public_id AS id,
              t.public_id AS tenantId,
              t.business_name AS tenantName,
              p.code AS planCode,
              p.name AS planName,
              s.status AS status,
              s.dunning_attempts AS dunningAttempts,
              s.grace_period_ends_at AS gracePeriodEndsAt,
              s.current_period_end AS currentPeriodEnd,
              inv.public_id AS overdueInvoiceId,
              inv.invoice_number AS overdueInvoiceNumber,
              inv.amount_due_minor AS amountDueMinor,
              inv.currency AS currency,
              (SELECT MAX(pay.failed_at)
                 FROM subscription_payments pay
                WHERE pay.invoice_id = inv.id AND pay.status = 'FAILED') AS lastPaymentFailedAt
         FROM subscriptions s
         JOIN tenants t ON t.id = s.tenant_id
         JOIN plans p ON p.id = s.plan_id
         LEFT JOIN subscription_invoices inv
           ON inv.subscription_id = s.id AND inv.status IN ('OPEN', 'PARTIALLY_PAID')
        WHERE (s.status = 'PAST_DUE' OR s.dunning_attempts > 0 OR (inv.id IS NOT NULL AND inv.status != 'PAID'))
          AND t.deleted_at IS NULL
        ORDER BY s.status = 'PAST_DUE' DESC, s.grace_period_ends_at ASC, s.dunning_attempts DESC`,
    )) as {
      id: string;
      tenantId: string;
      tenantName: string;
      planCode: string;
      planName: string;
      status: string;
      dunningAttempts: number;
      gracePeriodEndsAt: Date | null;
      currentPeriodEnd: Date | null;
      overdueInvoiceId: string | null;
      overdueInvoiceNumber: string | null;
      amountDueMinor: string | null;
      currency: string | null;
      lastPaymentFailedAt: Date | null;
    }[];

    const now = Date.now();
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;

    let expiringGracePeriodSoon = 0;
    let totalPastDue = 0;

    const items = rows.map((r) => {
      if (r.status === 'PAST_DUE') totalPastDue += 1;
      if (r.gracePeriodEndsAt) {
        const remaining = new Date(r.gracePeriodEndsAt).getTime() - now;
        if (remaining > 0 && remaining <= fortyEightHoursMs) {
          expiringGracePeriodSoon += 1;
        }
      }
      return {
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        planCode: r.planCode,
        planName: r.planName,
        status: r.status,
        dunningAttempts: Number(r.dunningAttempts ?? 0),
        gracePeriodEndsAt: r.gracePeriodEndsAt ? new Date(r.gracePeriodEndsAt).toISOString() : null,
        currentPeriodEnd: r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toISOString() : null,
        overdueInvoiceId: r.overdueInvoiceId,
        overdueInvoiceNumber: r.overdueInvoiceNumber,
        amountDueMinor: r.amountDueMinor,
        currency: r.currency,
        lastPaymentFailedAt: r.lastPaymentFailedAt ? new Date(r.lastPaymentFailedAt).toISOString() : null,
      };
    });

    return {
      items,
      total: items.length,
      totalAtRiskCount: totalPastDue,
      expiringGracePeriodSoon,
    };
  }
}
