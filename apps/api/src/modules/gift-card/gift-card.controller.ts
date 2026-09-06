import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buildPaginationMeta,
  checkGiftCardBalanceRequestSchema,
  issueGiftCardRequestSchema,
} from '@ems/contracts';
import { Permissions, Public, Validate } from '../../common/decorators';
import { Paginated } from '../../common/interceptors/response-envelope.interceptor';
import { GiftCardService } from './gift-card.service';

@ApiTags('gift-cards')
@Controller({ version: '1' })
export class GiftCardController {
  constructor(private readonly giftCards: GiftCardService) {}

  @Get('console/gift-cards')
  @Permissions('giftcard:read')
  @ApiOperation({ summary: 'List gift cards' })
  async list(@Query('page') page = '1', @Query('limit') limit = '25') {
    const { items, total } = await this.giftCards.list(Number(page), Number(limit));
    return new Paginated(items.map((c) => this.giftCards.toResponse(c)), buildPaginationMeta(Number(page), Number(limit), total));
  }

  @Post('console/gift-cards')
  @Permissions('giftcard:create')
  @Validate(issueGiftCardRequestSchema)
  @ApiOperation({ summary: 'Issue a gift card. The raw code is returned once and never again.' })
  async issue(@Body() body: ReturnType<typeof issueGiftCardRequestSchema.parse>) {
    return this.giftCards.issue(body);
  }

  @Post('storefront/gift-cards/check-balance')
  @Public()
  @Validate(checkGiftCardBalanceRequestSchema)
  @ApiOperation({ summary: "Check a gift card's remaining balance" })
  async checkBalance(@Body() body: ReturnType<typeof checkGiftCardBalanceRequestSchema.parse>) {
    const result = await this.giftCards.checkBalance(body.code);
    return { valid: result.valid, balance: result.balance?.toJSON() };
  }
}
