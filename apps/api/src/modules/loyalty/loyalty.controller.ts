import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { adjustLoyaltyPointsRequestSchema, buildPaginationMeta } from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@Controller({ path: 'console/customers/:customerId/loyalty', version: '1' })
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  @Permissions('loyalty:read')
  @ApiOperation({ summary: "A customer's loyalty ledger" })
  async history(
    @Param('customerId') customerId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '25',
  ) {
    const { items, total } = await this.loyalty.history(customerId, Number(page), Number(limit));
    return new Paginated(items, buildPaginationMeta(Number(page), Number(limit), total));
  }

  @Post('adjust')
  @Permissions('loyalty:adjust')
  @Validate(adjustLoyaltyPointsRequestSchema)
  @ApiOperation({ summary: 'Manually adjust a loyalty point balance' })
  async adjust(
    @Param('customerId') customerId: string,
    @Body() body: ReturnType<typeof adjustLoyaltyPointsRequestSchema.parse>,
  ) {
    await this.loyalty.adjust(customerId, body.pointsDelta, body.description);
    return { message: 'Adjusted.' };
  }
}
