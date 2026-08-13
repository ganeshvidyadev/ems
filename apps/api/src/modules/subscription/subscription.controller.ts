import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotFoundError } from '@ems/kernel';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AllowDuringOnboarding, Permissions, Public } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequestContextService } from '../../common/services/request-context.service';
import { PLAN_LIMIT_KEYS, PlanEntity, type PlanLimitKey } from '../../database/entities';
import { PlanQuotaService } from './services/plan-quota.service';
import { SubscriptionService } from './services/subscription.service';

const changePlanSchema = z.object({
  planCode: z.string().trim().min(1).max(64),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
});

const startSubscriptionSchema = z.object({
  planCode: z.string().trim().min(1).max(64),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

/**
 * Public pricing.
 *
 * `@Public()` because the pricing page is pre-signup — requiring a token to see prices
 * would be self-defeating. Only `is_public` plans are returned, so the negotiated
 * Enterprise plan stays out of the list.
 */
@ApiTags('plans')
@Controller({ path: 'plans', version: '1' })
export class PlanController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List publicly available plans' })
  async list() {
    const plans = await this.dataSource.getRepository(PlanEntity).find({
      where: { isPublic: true, status: 'ACTIVE' },
      order: { sortOrder: 'ASC' },
    });

    const limitRows = (await this.dataSource.query(
      `SELECT plan_id AS planId, limit_key AS limitKey, limit_value AS limitValue
         FROM plan_limits`,
    )) as { planId: number; limitKey: string; limitValue: string }[];

    const limitsByPlan = new Map<number, Record<string, number>>();
    for (const row of limitRows) {
      const bucket = limitsByPlan.get(row.planId) ?? {};
      bucket[row.limitKey] = Number(row.limitValue);
      limitsByPlan.set(row.planId, bucket);
    }

    return plans.map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      // Minor units as strings, matching the Money wire contract — a number here would
      // reintroduce float imprecision on the client.
      priceMonthlyMinor: plan.priceMonthlyMinor,
      priceYearlyMinor: plan.priceYearlyMinor,
      currency: plan.currency,
      trialDays: plan.trialDays,
      features: plan.features ?? [],
      limits: limitsByPlan.get(plan.id) ?? {},
    }));
  }
}

@ApiTags('subscription')
@Controller({ path: 'console/subscription', version: '1' })
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly quotas: PlanQuotaService,
    private readonly context: RequestContextService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @AllowDuringOnboarding()
  @Permissions('subscription:read')
  @ApiOperation({ summary: 'The tenant’s current subscription' })
  async current() {
    const tenantId = this.context.requireTenantId('read subscription');
    const subscription = await this.subscriptions.findByTenant(tenantId);

    if (!subscription) throw new NotFoundError('Subscription');

    const plan = await this.dataSource
      .getRepository(PlanEntity)
      .findOne({ where: { id: subscription.planId } });

    return {
      id: subscription.publicId,
      status: subscription.status,
      planCode: plan?.code ?? null,
      planName: plan?.name ?? null,
      billingCycle: subscription.billingCycle,
      unitAmountMinor: subscription.unitAmountMinor,
      currency: subscription.currency,
      trialEndsAt: subscription.trialEnd?.toISOString() ?? null,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString?.() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString?.() ?? null,
      cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
      gracePeriodEndsAt: subscription.gracePeriodEndsAt?.toISOString?.() ?? null,
    };
  }

  /**
   * Usage against every quota.
   *
   * Powers the billing screen's usage bars — showing a merchant they are at 94 of 100
   * products is what turns a hard 402 into an expected upgrade rather than a surprise.
   */
  @Get('usage')
  @Permissions('subscription:read')
  @ApiOperation({ summary: 'Current usage against each plan limit' })
  async usage() {
    const tenantId = this.context.requireTenantId('read usage');
    return this.quotas.summary(tenantId, [...PLAN_LIMIT_KEYS] as PlanLimitKey[]);
  }

  @Post()
  // The tenant is PENDING at this point — this call is what starts provisioning.
  @AllowDuringOnboarding()
  @Permissions('subscription:upgrade')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a subscription for this tenant' })
  async start(
    @Body(new ZodValidationPipe(startSubscriptionSchema))
    body: { planCode: string; billingCycle: 'MONTHLY' | 'YEARLY' },
  ) {
    const tenantId = this.context.requireTenantId('start subscription');
    const subscription = await this.subscriptions.start({
      tenantId,
      planCode: body.planCode,
      billingCycle: body.billingCycle,
    });

    return {
      id: subscription.publicId,
      status: subscription.status,
      trialEndsAt: subscription.trialEnd?.toISOString() ?? null,
    };
  }

  @Post('change-plan')
  @Permissions('subscription:upgrade', 'subscription:downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upgrade or downgrade, prorated' })
  async changePlan(
    @Body(new ZodValidationPipe(changePlanSchema))
    body: { planCode: string; billingCycle?: 'MONTHLY' | 'YEARLY' },
  ) {
    const tenantId = this.context.requireTenantId('change plan');
    const subscription = await this.subscriptions.changePlan(
      tenantId,
      body.planCode,
      body.billingCycle,
    );

    return {
      id: subscription.publicId,
      status: subscription.status,
      planCode: body.planCode,
      message: 'Plan changed. A prorated invoice has been issued.',
    };
  }

  @Post('cancel')
  @Permissions('subscription:cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel at the end of the current period' })
  async cancel() {
    const tenantId = this.context.requireTenantId('cancel subscription');
    const subscription = await this.subscriptions.cancel(tenantId, false);

    return {
      // They paid through the end of the period, so that is when it stops.
      effectiveAt: subscription.currentPeriodEnd?.toISOString?.() ?? null,
      message: 'Your subscription will end at the close of the current billing period.',
    };
  }

  @Post('resume')
  @Permissions('subscription:upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a scheduled cancellation' })
  async resume() {
    const tenantId = this.context.requireTenantId('resume subscription');
    await this.subscriptions.resume(tenantId);
    return { message: 'Subscription resumed.' };
  }
}
