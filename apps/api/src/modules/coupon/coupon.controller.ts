import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  couponListQuerySchema,
  createCouponRequestSchema,
  updateCouponRequestSchema,
  validateCouponRequestSchema,
} from '@ems/contracts';
import { Money } from '@ems/kernel';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CouponService } from './coupon.service';

@ApiTags('coupons')
@Controller({ path: 'console/coupons', version: '1' })
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Get()
  @Permissions('coupon:read')
  @ApiOperation({ summary: 'List coupons' })
  async list(
    @Query(new ZodValidationPipe(couponListQuerySchema))
    query: ReturnType<typeof couponListQuerySchema.parse>,
  ) {
    const { items, total } = await this.coupons.list({
      page: query.page,
      limit: query.limit,
      status: query.status,
      sort: query.sort,
    });
    return new Paginated(
      await Promise.all(items.map((c) => this.coupons.toResponse(c))),
      buildPaginationMeta(query.page, query.limit, total),
    );
  }

  @Get(':id')
  @Permissions('coupon:read')
  @ApiOperation({ summary: 'Get a coupon' })
  async get(@Param('id') id: string) {
    return this.coupons.toResponse(await this.coupons.getByPublicId(id));
  }

  @Post()
  @Permissions('coupon:create')
  @Validate(createCouponRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a coupon' })
  async create(@Body() body: ReturnType<typeof createCouponRequestSchema.parse>) {
    return this.coupons.toResponse(await this.coupons.create(body));
  }

  @Put(':id')
  @Permissions('coupon:update')
  @Validate(updateCouponRequestSchema)
  @ApiOperation({ summary: 'Update a coupon' })
  async update(@Param('id') id: string, @Body() body: ReturnType<typeof updateCouponRequestSchema.parse>) {
    return this.coupons.toResponse(await this.coupons.update(id, body));
  }

  @Delete(':id')
  @Permissions('coupon:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a coupon' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.coupons.remove(id);
  }

  @Post('validate')
  @Permissions('coupon:read')
  @Validate(validateCouponRequestSchema)
  @ApiOperation({ summary: 'Preview whether a code is valid and its discount for a given subtotal' })
  async validate(@Body() body: ReturnType<typeof validateCouponRequestSchema.parse>) {
    try {
      // Currency is resolved from the tenant's store elsewhere in the real
      // checkout path; the preview endpoint takes it as given by the caller
      // since it has no order context yet.
      const subtotal = Money.fromMinor(body.subtotalMinor, 'INR');
      const { discount } = await this.coupons.validate(body.code, subtotal, body.customerId ?? null);
      return { valid: true, discountMinor: discount.amountMinor.toString() };
    } catch (error) {
      return { valid: false, discountMinor: '0', reason: error instanceof Error ? error.message : 'Invalid coupon' };
    }
  }
}
