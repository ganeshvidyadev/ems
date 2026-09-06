import { Injectable } from '@nestjs/common';
import type { CouponResponse, CreateCouponRequest, UpdateCouponRequest } from '@ems/contracts';
import { ConflictError, Money, type CurrencyCode } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';
import type { CouponEntity } from '../../database/entities';
import {
  CouponExpiredError,
  CouponNotEligibleError,
  CouponUsageLimitReachedError,
} from '../../common/errors/api.errors';
import { CouponRedemptionRepository, CouponRepository } from './coupon.repository';

export interface CouponValidation {
  coupon: CouponEntity;
  discount: Money;
}

@Injectable()
export class CouponService {
  constructor(
    private readonly coupons: CouponRepository,
    private readonly redemptions: CouponRedemptionRepository,
  ) {}

  async list(query: {
    page: number;
    limit: number;
    status?: CouponEntity['status'];
    sort: { field: string; direction: 'ASC' | 'DESC' }[];
  }): Promise<PaginatedResult<CouponEntity>> {
    return this.coupons.findAndCount({
      where: query.status ? { status: query.status } : {},
      order: Object.fromEntries(query.sort.map((s) => [s.field, s.direction])),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async getByPublicId(publicId: string): Promise<CouponEntity> {
    return this.coupons.findByPublicIdOrFail(publicId);
  }

  async create(input: CreateCouponRequest): Promise<CouponEntity> {
    if (await this.coupons.codeExists(input.code)) {
      throw new ConflictError(`Coupon code '${input.code}' already exists`);
    }

    let storeId: string | null = null;
    if (input.storeId) {
      storeId = await this.coupons.resolveStoreId(input.storeId);
      if (!storeId) throw new ConflictError(`Store '${input.storeId}' not found`);
    }

    return this.coupons.insert({
      storeId,
      code: input.code,
      name: input.name ?? null,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountMinor: input.maxDiscountMinor ?? null,
      minOrderMinor: input.minOrderMinor ?? null,
      appliesTo: input.appliesTo,
      targetIds: input.targetIds ?? null,
      excludedIds: input.excludedIds ?? null,
      buyQuantity: input.buyQuantity ?? null,
      getQuantity: input.getQuantity ?? null,
      usageLimitTotal: input.usageLimitTotal ?? null,
      usageLimitPerCustomer: input.usageLimitPerCustomer ?? null,
      customerEligibility: input.customerEligibility,
      eligibleCustomerIds: input.eligibleCustomerIds ?? null,
      eligibleGroup: input.eligibleGroup ?? null,
      combinable: input.combinable,
      autoApply: input.autoApply,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    });
  }

  async update(publicId: string, input: UpdateCouponRequest): Promise<CouponEntity> {
    const coupon = await this.coupons.findByPublicIdOrFail(publicId);

    if (input.code && input.code !== coupon.code && (await this.coupons.codeExists(input.code, publicId))) {
      throw new ConflictError(`Coupon code '${input.code}' already exists`);
    }

    Object.assign(coupon, {
      code: input.code ?? coupon.code,
      name: input.name ?? coupon.name,
      description: input.description ?? coupon.description,
      discountType: input.discountType ?? coupon.discountType,
      discountValue: input.discountValue ?? coupon.discountValue,
      maxDiscountMinor: input.maxDiscountMinor === undefined ? coupon.maxDiscountMinor : input.maxDiscountMinor,
      minOrderMinor: input.minOrderMinor === undefined ? coupon.minOrderMinor : input.minOrderMinor,
      appliesTo: input.appliesTo ?? coupon.appliesTo,
      targetIds: input.targetIds ?? coupon.targetIds,
      excludedIds: input.excludedIds ?? coupon.excludedIds,
      usageLimitTotal: input.usageLimitTotal === undefined ? coupon.usageLimitTotal : input.usageLimitTotal,
      usageLimitPerCustomer:
        input.usageLimitPerCustomer === undefined ? coupon.usageLimitPerCustomer : input.usageLimitPerCustomer,
      customerEligibility: input.customerEligibility ?? coupon.customerEligibility,
      combinable: input.combinable ?? coupon.combinable,
      autoApply: input.autoApply ?? coupon.autoApply,
      startsAt: input.startsAt ? new Date(input.startsAt) : coupon.startsAt,
      endsAt: input.endsAt ? new Date(input.endsAt) : coupon.endsAt,
      status: input.status ?? coupon.status,
    });

    await this.coupons.save(coupon);
    return coupon;
  }

  async remove(publicId: string): Promise<void> {
    await this.coupons.softDeleteByPublicId(publicId);
  }

  /**
   * Validates a code against one basket and returns the discount it would
   * apply — used by both the cart preview and checkout's authoritative
   * re-check (never trust the discount the cart displayed earlier).
   */
  async validate(
    code: string,
    subtotal: Money,
    customerId: string | null,
  ): Promise<CouponValidation> {
    const coupon = await this.coupons.findByCode(code);
    if (!coupon || coupon.status !== 'ACTIVE' || coupon.deletedAt) {
      throw new CouponNotEligibleError(`Coupon '${code}' is not valid`);
    }
    if (!coupon.isWithinWindow) {
      throw new CouponExpiredError(`Coupon '${code}' is not currently active`);
    }
    if (coupon.isExhausted) {
      throw new CouponUsageLimitReachedError(`Coupon '${code}' has reached its usage limit`);
    }
    if (coupon.minOrderMinor && subtotal.amountMinor < BigInt(coupon.minOrderMinor)) {
      throw new CouponNotEligibleError(
        `A minimum order of ${coupon.minOrderMinor} ${subtotal.currency} is required for this coupon`,
      );
    }
    if (coupon.customerEligibility === 'SPECIFIC') {
      if (!customerId || !(coupon.eligibleCustomerIds ?? []).includes(customerId)) {
        throw new CouponNotEligibleError(`Coupon '${code}' is not available to this customer`);
      }
    }
    if (coupon.usageLimitPerCustomer && customerId) {
      const used = await this.redemptions.countForCustomer(coupon.id, customerId);
      if (used >= coupon.usageLimitPerCustomer) {
        throw new CouponUsageLimitReachedError(`Coupon '${code}' has already been used the maximum number of times`);
      }
    }

    const discount = this.computeDiscount(coupon, subtotal);
    return { coupon, discount };
  }

  private computeDiscount(coupon: CouponEntity, subtotal: Money): Money {
    let discount: Money;

    switch (coupon.discountType) {
      case 'PERCENTAGE':
        discount = subtotal.percentage(coupon.discountValue);
        break;
      case 'FIXED_AMOUNT':
        // `discount_value` is `DECIMAL(12,4)` so the same column also holds a
        // PERCENTAGE rate; for FIXED_AMOUNT it carries minor units as a decimal
        // string, so only the integer part is meaningful (minor units are whole).
        discount = Money.fromMinor(coupon.discountValue.split('.')[0] ?? '0', subtotal.currency);
        break;
      case 'FREE_SHIPPING':
        // Shipping is discounted at checkout time, once the shipping cost is
        // known — this coupon type contributes zero to the item-level discount.
        discount = Money.zero(subtotal.currency);
        break;
      case 'BUY_X_GET_Y':
        // Requires the line-item mix to evaluate (which SKUs, which quantities);
        // computed by the caller with `computeBuyXGetYDiscount` instead.
        discount = Money.zero(subtotal.currency);
        break;
      default:
        discount = Money.zero(subtotal.currency);
    }

    if (coupon.maxDiscountMinor) {
      const cap = Money.fromMinor(coupon.maxDiscountMinor, subtotal.currency);
      if (discount.greaterThan(cap)) discount = cap;
    }
    if (discount.greaterThan(subtotal)) discount = subtotal;

    return discount;
  }

  /** Claims one redemption inside the caller's transaction — checkout only. */
  async redeem(
    manager: EntityManager,
    coupon: CouponEntity,
    orderId: string,
    customerId: string | null,
    discount: Money,
  ): Promise<void> {
    const claimed = await this.coupons.withManager(manager).incrementUsage(coupon.id);
    if (!claimed) {
      throw new CouponUsageLimitReachedError(`Coupon '${coupon.code}' has reached its usage limit`);
    }

    await this.redemptions.withManager(manager).insert({
      couponId: coupon.id,
      orderId,
      customerId,
      discountMinor: discount.amountMinor.toString(),
    });
  }

  /** Reverses a redemption — order cancelled before the coupon's discount was ever fulfilled. */
  async releaseRedemption(manager: EntityManager, couponId: string, orderId: string): Promise<void> {
    const scopedCoupons = this.coupons.withManager(manager);
    const scopedRedemptions = this.redemptions.withManager(manager);

    const redemption = await scopedRedemptions.findByOrder(couponId, orderId);
    if (!redemption) return;

    await scopedRedemptions.hardDelete({ id: redemption.id } as never);
    await scopedCoupons.decrementUsage(couponId);
  }

  async toResponse(coupon: CouponEntity): Promise<CouponResponse> {
    const storeId = await this.coupons.storePublicId(coupon.storeId);
    return {
      id: coupon.publicId,
      storeId,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscountMinor: coupon.maxDiscountMinor,
      minOrderMinor: coupon.minOrderMinor,
      appliesTo: coupon.appliesTo,
      usageLimitTotal: coupon.usageLimitTotal,
      usageLimitPerCustomer: coupon.usageLimitPerCustomer,
      usageCount: coupon.usageCount,
      customerEligibility: coupon.customerEligibility,
      combinable: coupon.combinable,
      autoApply: coupon.autoApply,
      startsAt: coupon.startsAt?.toISOString() ?? null,
      endsAt: coupon.endsAt?.toISOString() ?? null,
      status: coupon.status,
      createdAt: coupon.createdAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
    };
  }
}

export type { CurrencyCode };
