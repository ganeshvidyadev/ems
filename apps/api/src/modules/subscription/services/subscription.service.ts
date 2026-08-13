import { Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  Money,
  NotFoundError,
  newPublicId,
  type CurrencyCode,
} from '@ems/kernel';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  PlanEntity,
  SubscriptionEntity,
  TenantEntity,
  type BillingCycle,
  type InvoiceLineItem,
} from '../../../database/entities';
import { OutboxService } from '../../../common/services/outbox.service';
import { InvoiceService } from './invoice.service';
import { PlanQuotaService } from './plan-quota.service';

/** Days a PAST_DUE tenant keeps read access before suspension. */
const GRACE_PERIOD_DAYS = 7;
/** Dunning attempts before giving up and suspending. */
const MAX_DUNNING_ATTEMPTS = 4;

export interface StartSubscriptionInput {
  tenantId: string;
  planCode: string;
  billingCycle: BillingCycle;
  /** Skip the trial — used when a platform admin assigns a plan directly. */
  skipTrial?: boolean;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly invoices: InvoiceService,
    private readonly quotas: PlanQuotaService,
    private readonly outbox: OutboxService,
  ) {}

  // =========================================================================
  // Start
  // =========================================================================

  /**
   * Starts a subscription, in trial when the plan offers one.
   *
   * A trialing subscription is created **without** an invoice: billing the first period up
   * front would charge a card before the trial the merchant was promised has elapsed. The
   * first invoice is raised at trial end by the renewal job.
   */
  async start(input: StartSubscriptionInput): Promise<SubscriptionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await manager.findOne(PlanEntity, {
        where: { code: input.planCode, status: 'ACTIVE' },
      });
      if (!plan) throw new NotFoundError('Plan', input.planCode);

      const existing = await manager.query(
        `SELECT id FROM subscriptions WHERE tenant_id = ? AND active_guard = 1 LIMIT 1`,
        [input.tenantId],
      );
      if ((existing as unknown[]).length > 0) {
        // The database would reject this anyway via uq_subscriptions_one_active; catching
        // it here turns an opaque duplicate-key error into a useful message.
        throw new ConflictError('This tenant already has an active subscription');
      }

      const now = new Date();
      const useTrial = !input.skipTrial && plan.trialDays > 0;
      const trialEnd = useTrial ? addDays(now, plan.trialDays) : null;

      // During a trial the "period" is the trial itself, so `current_period_end` is when
      // money first becomes due — which is what the renewal job scans on.
      const periodEnd = useTrial ? trialEnd! : addCycle(now, input.billingCycle);

      const subscription = await manager.save(
        manager.create(SubscriptionEntity, {
          publicId: newPublicId(),
          tenantId: input.tenantId,
          planId: plan.id,
          billingCycle: input.billingCycle,
          status: useTrial ? 'TRIALING' : 'ACTIVE',
          // Snapshot — a later plan price edit must not re-price this subscriber.
          unitAmountMinor: plan.priceFor(input.billingCycle),
          currency: plan.currency,
          quantity: 1,
          trialStart: useTrial ? now : null,
          trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenew: true,
        }),
      );

      await manager.query(
        `UPDATE tenants
            SET current_subscription_id = ?,
                status = CASE WHEN status = 'PENDING' THEN 'PROVISIONING' ELSE status END,
                trial_ends_at = ?
          WHERE id = ?`,
        [subscription.id, trialEnd, input.tenantId],
      );

      // Only bill immediately when there is no trial and the plan actually costs money.
      if (!useTrial && plan.priceFor(input.billingCycle) !== '0') {
        await this.raiseInvoice(manager, subscription, plan, now, periodEnd);
      }

      await this.outbox.emit(manager, {
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'subscription.started',
        payload: {
          subscriptionId: subscription.id,
          tenantId: input.tenantId,
          planCode: plan.code,
          billingCycle: input.billingCycle,
          trialing: useTrial,
          trialEndsAt: trialEnd?.toISOString() ?? null,
        },
        tenantId: input.tenantId,
      });

      await this.quotas.invalidate(input.tenantId);

      return subscription;
    });
  }

  // =========================================================================
  // Change plan
  // =========================================================================

  /**
   * Upgrades or downgrades, with proration.
   *
   * The merchant is credited for the unused remainder of the period they already paid for,
   * and charged the new plan's price for that same remainder. Both lines land on one
   * invoice so the net is visible rather than arriving as two unexplained charges.
   *
   * Proration uses **integer basis points** throughout. A float ratio would reintroduce
   * the rounding drift `Money` exists to prevent, and on a refund line that drift is money
   * we owe someone.
   */
  async changePlan(
    tenantId: string,
    newPlanCode: string,
    newCycle?: BillingCycle,
  ): Promise<SubscriptionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.requireLive(manager, tenantId);

      const newPlan = await manager.findOne(PlanEntity, {
        where: { code: newPlanCode, status: 'ACTIVE' },
      });
      if (!newPlan) throw new NotFoundError('Plan', newPlanCode);

      const cycle = newCycle ?? subscription.billingCycle;

      if (newPlan.id === subscription.planId && cycle === subscription.billingCycle) {
        throw new BusinessRuleError('Already on this plan and billing cycle');
      }

      const currency = subscription.currency as CurrencyCode;
      const now = new Date();
      const wasTrialing = subscription.status === 'TRIALING';

      /**
       * Converting a trial to paid starts a **fresh full period**, and is not prorated.
       *
       * Prorating against the trial's remaining days would charge a full month's price for
       * whatever was left of the trial — 14 days of service billed as 30. The merchant
       * chose to start paying now, so the paid period starts now.
       *
       * A paid→paid change keeps the existing period and prorates within it, because that
       * period is already paid for.
       */
      const remainingBp = wasTrialing ? 10_000 : subscription.remainingBasisPoints(now);

      const lineItems: InvoiceLineItem[] = [];

      // Credit for what they already paid but will not use.
      //
      // Skipped while trialing: no money changed hands, so crediting would hand out real
      // money for an unpaid period — a genuine (and exploitable) accounting hole.
      if (subscription.status !== 'TRIALING' && remainingBp > 0) {
        const paid = Money.fromMinor(subscription.unitAmountMinor, currency);
        const credit = paid.multiplyByRatio(BigInt(remainingBp), 10_000n);

        if (credit.isPositive) {
          lineItems.push({
            description: `Unused time on previous plan (${remainingBp / 100}% of period)`,
            quantity: 1,
            unitAmountMinor: credit.negate().amountMinor.toString(),
            amountMinor: credit.negate().amountMinor.toString(),
            proration: true,
          });
        }
      }

      // Charge for the new plan. A trial conversion buys a whole period; a paid change
      // buys only the remainder of the one already running.
      const chargeUntil = wasTrialing ? addCycle(now, cycle) : subscription.currentPeriodEnd;
      const newPrice = Money.fromMinor(newPlan.priceFor(cycle), currency);
      const proratedCharge = newPrice.multiplyByRatio(BigInt(remainingBp), 10_000n);

      if (proratedCharge.isPositive) {
        lineItems.push({
          description: wasTrialing
            ? `${newPlan.name} (${cycle.toLowerCase()})`
            : `${newPlan.name} (${cycle.toLowerCase()}) — remainder of current period`,
          quantity: 1,
          unitAmountMinor: proratedCharge.amountMinor.toString(),
          amountMinor: proratedCharge.amountMinor.toString(),
          periodStart: now.toISOString(),
          periodEnd: chargeUntil.toISOString(),
          proration: !wasTrialing,
        });
      }

      const previousPlanId = subscription.planId;

      subscription.planId = newPlan.id;
      subscription.billingCycle = cycle;
      subscription.unitAmountMinor = newPlan.priceFor(cycle);
      subscription.currency = newPlan.currency;
      // An upgrade ends the trial: they have chosen to pay, and keeping them trialing would
      // give the higher plan away free until the original trial expired.
      //
      // The billing period is reset to a full cycle from now, matching what the invoice
      // above actually charges for. Leaving it at the old trial end would bill a month and
      // deliver only the trial's remaining days.
      if (wasTrialing) {
        subscription.status = 'ACTIVE';
        subscription.trialEnd = now;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = chargeUntil;
      }

      await manager.save(SubscriptionEntity, subscription);

      if (lineItems.length > 0) {
        await this.invoices.create(manager, {
          tenantId,
          subscriptionId: subscription.id,
          currency,
          periodStart: now,
          periodEnd: chargeUntil,
          lineItems,
          dueInDays: 0,
        });
      }

      await this.outbox.emit(manager, {
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'subscription.plan_changed',
        payload: {
          subscriptionId: subscription.id,
          tenantId,
          fromPlanId: previousPlanId,
          toPlanCode: newPlan.code,
          billingCycle: cycle,
          prorationBasisPoints: remainingBp,
        },
        tenantId,
      });

      // Limits changed — the cache must not serve the old plan's caps.
      await this.quotas.invalidate(tenantId);

      return subscription;
    });
  }

  // =========================================================================
  // Cancel / resume
  // =========================================================================

  /**
   * Cancels at period end by default.
   *
   * They paid through the end of the period, so taking the store down immediately would be
   * taking something they own. `immediately` exists for abuse takedowns.
   */
  async cancel(tenantId: string, immediately = false): Promise<SubscriptionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.requireLive(manager, tenantId);

      if (immediately) {
        subscription.status = 'CANCELLED';
        subscription.cancelledAt = new Date();
        subscription.endedAt = new Date();
        subscription.autoRenew = false;
      } else {
        subscription.cancelAtPeriodEnd = true;
        subscription.autoRenew = false;
        subscription.cancelledAt = new Date();
      }

      await manager.save(SubscriptionEntity, subscription);

      if (immediately) {
        await manager.query(
          `UPDATE tenants SET current_subscription_id = NULL, status = 'CANCELLED' WHERE id = ?`,
          [tenantId],
        );
      }

      await this.outbox.emit(manager, {
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: immediately ? 'subscription.cancelled' : 'subscription.cancel_scheduled',
        payload: {
          subscriptionId: subscription.id,
          tenantId,
          effectiveAt: immediately
            ? new Date().toISOString()
            : subscription.currentPeriodEnd.toISOString(),
        },
        tenantId,
      });

      await this.quotas.invalidate(tenantId);

      return subscription;
    });
  }

  /** Undoes a scheduled cancellation while the period is still running. */
  async resume(tenantId: string): Promise<SubscriptionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.requireLive(manager, tenantId);

      if (!subscription.cancelAtPeriodEnd) {
        throw new BusinessRuleError('This subscription is not scheduled to cancel');
      }

      subscription.cancelAtPeriodEnd = false;
      subscription.autoRenew = true;
      subscription.cancelledAt = null;

      return manager.save(SubscriptionEntity, subscription);
    });
  }

  // =========================================================================
  // Billing lifecycle (driven by the subscription-billing queue)
  // =========================================================================

  /** Subscriptions whose period has ended and that need renewing or expiring. */
  async findDueForRenewal(limit = 100): Promise<SubscriptionEntity[]> {
    return this.dataSource.getRepository(SubscriptionEntity).query(
      `SELECT * FROM subscriptions
        WHERE status IN ('TRIALING','ACTIVE')
          AND current_period_end <= NOW(3)
        ORDER BY current_period_end
        LIMIT ?`,
      [limit],
    ) as Promise<SubscriptionEntity[]>;
  }

  /**
   * Rolls a subscription into its next period and raises the invoice.
   *
   * Idempotent on the period boundary: it advances only if `current_period_end` still
   * matches what the caller observed, so a re-delivered renewal job cannot skip a month or
   * raise two invoices for the same period.
   */
  async renew(subscriptionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const subscription = await manager.findOne(SubscriptionEntity, {
        where: { id: subscriptionId },
      });
      if (!subscription || !subscription.isLive) return;

      if (subscription.cancelAtPeriodEnd) {
        subscription.status = 'EXPIRED';
        subscription.endedAt = new Date();
        await manager.save(SubscriptionEntity, subscription);
        await manager.query(
          `UPDATE tenants SET status = 'CANCELLED', current_subscription_id = NULL WHERE id = ?`,
          [subscription.tenantId],
        );
        return;
      }

      const plan = await manager.findOne(PlanEntity, { where: { id: subscription.planId } });
      if (!plan) return;

      const periodStart = subscription.currentPeriodEnd;
      const periodEnd = addCycle(periodStart, subscription.billingCycle);

      subscription.currentPeriodStart = periodStart;
      subscription.currentPeriodEnd = periodEnd;
      // Trial is over; from here on it is a paying subscription.
      subscription.status = 'ACTIVE';
      await manager.save(SubscriptionEntity, subscription);

      if (subscription.unitAmountMinor !== '0') {
        await this.raiseInvoice(manager, subscription, plan, periodStart, periodEnd);
      }

      await this.outbox.emit(manager, {
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'subscription.renewed',
        payload: {
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        tenantId: subscription.tenantId,
      });
    });
  }

  /**
   * Records a failed collection and moves the subscription along the dunning path.
   *
   * First failure starts a grace period during which the tenant is **read-only, not
   * suspended** — their storefront keeps serving customers while the card is fixed. Cutting
   * a paying merchant off over one failed retry loses them revenue and loses us the
   * account.
   */
  async recordPaymentFailure(subscriptionId: string, reason: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const subscription = await manager.findOne(SubscriptionEntity, {
        where: { id: subscriptionId },
      });
      if (!subscription) return;

      subscription.dunningAttempts += 1;

      if (subscription.status !== 'PAST_DUE') {
        subscription.status = 'PAST_DUE';
        subscription.gracePeriodEndsAt = addDays(new Date(), GRACE_PERIOD_DAYS);
      }

      const exhausted = subscription.dunningAttempts >= MAX_DUNNING_ATTEMPTS;
      await manager.save(SubscriptionEntity, subscription);

      await manager.query(
        `UPDATE tenants SET status = ? WHERE id = ? AND status IN ('ACTIVE','TRIAL','PAST_DUE')`,
        [exhausted ? 'SUSPENDED' : 'PAST_DUE', subscription.tenantId],
      );

      await this.outbox.emit(manager, {
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: exhausted ? 'subscription.suspended' : 'subscription.payment_failed',
        payload: {
          subscriptionId: subscription.id,
          tenantId: subscription.tenantId,
          attempt: subscription.dunningAttempts,
          reason,
          gracePeriodEndsAt: subscription.gracePeriodEndsAt?.toISOString() ?? null,
        },
        tenantId: subscription.tenantId,
      });
    });
  }

  /** Restores a PAST_DUE or SUSPENDED tenant after a successful collection. */
  async recordPaymentSuccess(subscriptionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const subscription = await manager.findOne(SubscriptionEntity, {
        where: { id: subscriptionId },
      });
      if (!subscription) return;

      subscription.status = 'ACTIVE';
      subscription.dunningAttempts = 0;
      subscription.gracePeriodEndsAt = null;
      await manager.save(SubscriptionEntity, subscription);

      await manager.query(
        `UPDATE tenants SET status = 'ACTIVE' WHERE id = ? AND status IN ('PAST_DUE','SUSPENDED')`,
        [subscription.tenantId],
      );

      await this.outbox.emit(manager, {
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'subscription.reactivated',
        payload: { subscriptionId: subscription.id, tenantId: subscription.tenantId },
        tenantId: subscription.tenantId,
      });
    });
  }

  // =========================================================================
  // Read
  // =========================================================================

  async findByTenant(tenantId: string): Promise<SubscriptionEntity | null> {
    const rows = (await this.dataSource.query(
      `SELECT * FROM subscriptions WHERE tenant_id = ? AND active_guard = 1 LIMIT 1`,
      [tenantId],
    )) as SubscriptionEntity[];
    return rows[0] ?? null;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async requireLive(
    manager: EntityManager,
    tenantId: string,
  ): Promise<SubscriptionEntity> {
    const rows = (await manager.query(
      `SELECT id FROM subscriptions WHERE tenant_id = ? AND active_guard = 1 LIMIT 1`,
      [tenantId],
    )) as { id: string }[];

    const id = rows[0]?.id;
    if (!id) throw new NotFoundError('Active subscription');

    const subscription = await manager.findOne(SubscriptionEntity, { where: { id } });
    if (!subscription) throw new NotFoundError('Active subscription');

    return subscription;
  }

  private async raiseInvoice(
    manager: EntityManager,
    subscription: SubscriptionEntity,
    plan: PlanEntity,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    await this.invoices.create(manager, {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      currency: subscription.currency as CurrencyCode,
      periodStart,
      periodEnd,
      lineItems: [
        {
          description: `${plan.name} (${subscription.billingCycle.toLowerCase()})`,
          quantity: subscription.quantity,
          unitAmountMinor: subscription.unitAmountMinor,
          amountMinor: (
            BigInt(subscription.unitAmountMinor) * BigInt(subscription.quantity)
          ).toString(),
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      ],
      dueInDays: 7,
    });
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Advances by one billing cycle, clamping to the last day of a short month.
 *
 * `setMonth` on 31 January would roll to 3 March, silently skipping February and giving
 * the merchant a free month. Clamping to 28 February is the behaviour every billing system
 * settles on.
 */
function addCycle(from: Date, cycle: BillingCycle): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();

  if (cycle === 'YEARLY') {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    result.setUTCMonth(result.getUTCMonth() + 1);
  }

  // Overflowed into the following month — step back to that month's last day.
  if (result.getUTCDate() !== day) {
    result.setUTCDate(0);
  }

  return result;
}
