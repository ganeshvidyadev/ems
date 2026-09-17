import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessRuleError, ConflictError, NotFoundError } from '@ems/kernel';
import type { CreatePlanRequest, PlanResponse, UpdatePlanRequest } from '@ems/contracts';
import { PlanEntity, PlanLimitEntity, SubscriptionEntity } from '../../database/entities';

@Injectable()
export class PlatformPlanService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(): Promise<PlanResponse[]> {
    const plans = await this.dataSource.getRepository(PlanEntity).find({ order: { sortOrder: 'ASC' } });
    return Promise.all(plans.map((plan) => this.toResponse(plan)));
  }

  async get(code: string): Promise<PlanResponse> {
    const plan = await this.findOrFail(code);
    return this.toResponse(plan);
  }

  async create(input: CreatePlanRequest): Promise<PlanResponse> {
    const existing = await this.dataSource.getRepository(PlanEntity).findOne({ where: { code: input.code } });
    if (existing) throw new ConflictError(`A plan with code '${input.code}' already exists`);

    const plan = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(PlanEntity, {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          priceMonthlyMinor: input.priceMonthlyMinor,
          priceYearlyMinor: input.priceYearlyMinor,
          currency: input.currency,
          trialDays: input.trialDays,
          isPublic: input.isPublic,
          sortOrder: input.sortOrder,
          features: input.features,
          status: 'ACTIVE',
        }),
      );
      await this.replaceLimits(manager, saved.id, input.limits);
      return saved;
    });

    return this.toResponse(plan);
  }

  async update(code: string, input: UpdatePlanRequest): Promise<PlanResponse> {
    const plan = await this.findOrFail(code);

    await this.dataSource.transaction(async (manager) => {
      if (input.name !== undefined) plan.name = input.name;
      if (input.description !== undefined) plan.description = input.description;
      if (input.priceMonthlyMinor !== undefined) plan.priceMonthlyMinor = input.priceMonthlyMinor;
      if (input.priceYearlyMinor !== undefined) plan.priceYearlyMinor = input.priceYearlyMinor;
      if (input.currency !== undefined) plan.currency = input.currency;
      if (input.trialDays !== undefined) plan.trialDays = input.trialDays;
      if (input.isPublic !== undefined) plan.isPublic = input.isPublic;
      if (input.sortOrder !== undefined) plan.sortOrder = input.sortOrder;
      if (input.features !== undefined) plan.features = input.features;
      await manager.save(plan);

      if (input.limits !== undefined) await this.replaceLimits(manager, plan.id, input.limits);
    });

    return this.get(code);
  }

  async archive(code: string): Promise<PlanResponse> {
    const plan = await this.findOrFail(code);
    plan.status = 'ARCHIVED';
    await this.dataSource.getRepository(PlanEntity).save(plan);
    return this.toResponse(plan);
  }

  async remove(code: string): Promise<void> {
    const plan = await this.findOrFail(code);

    const subscriberCount = await this.dataSource
      .getRepository(SubscriptionEntity)
      .count({ where: { planId: plan.id } });
    if (subscriberCount > 0) {
      throw new BusinessRuleError(
        `Cannot delete '${code}': ${subscriberCount} tenant${subscriberCount === 1 ? ' is' : 's are'} subscribed to it. Archive it instead.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PlanLimitEntity, { planId: plan.id });
      await manager.delete(PlanEntity, { id: plan.id });
    });
  }

  private async findOrFail(code: string): Promise<PlanEntity> {
    const plan = await this.dataSource.getRepository(PlanEntity).findOne({ where: { code } });
    if (!plan) throw new NotFoundError('Plan', code);
    return plan;
  }

  private async replaceLimits(
    manager: DataSource['manager'],
    planId: number,
    limits: Record<string, number>,
  ): Promise<void> {
    // Delete-and-reinsert rather than diffing: `plan_limits` is a handful of rows
    // per plan, and a full replace can never leave a stale key behind.
    await manager.delete(PlanLimitEntity, { planId });
    const entries = Object.entries(limits);
    if (entries.length === 0) return;

    await manager.save(
      entries.map(([limitKey, limitValue]) =>
        manager.create(PlanLimitEntity, { planId, limitKey: limitKey as never, limitValue: String(limitValue) }),
      ),
    );
  }

  private async toResponse(plan: PlanEntity): Promise<PlanResponse> {
    const [limitRows, subscriberCount] = await Promise.all([
      this.dataSource.getRepository(PlanLimitEntity).find({ where: { planId: plan.id } }),
      this.dataSource.getRepository(SubscriptionEntity).count({ where: { planId: plan.id } }),
    ]);

    const limits: Record<string, number> = {};
    for (const row of limitRows) limits[row.limitKey] = Number(row.limitValue);

    return {
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceMonthlyMinor: plan.priceMonthlyMinor,
      priceYearlyMinor: plan.priceYearlyMinor,
      currency: plan.currency,
      trialDays: plan.trialDays,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
      features: plan.features ?? [],
      status: plan.status,
      limits: limits as PlanResponse['limits'],
      subscriberCount,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }
}
