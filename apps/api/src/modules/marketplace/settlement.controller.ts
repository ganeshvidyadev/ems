import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { markSettlementPaidRequestSchema, runSettlementBatchRequestSchema } from '@ems/contracts';
import { CurrentUser, Permissions, Validate } from '../../common/decorators';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { SettlementService } from './settlement.service';

@ApiTags('settlements')
@Controller({ version: '1' })
export class SettlementController {
  constructor(private readonly settlements: SettlementService) {}

  // -------------------------------------------------------------------------
  // Tenant-facing — a supplier or reseller viewing their own statements
  // -------------------------------------------------------------------------

  @Get('console/settlements')
  @Permissions('settlement:read')
  @ApiOperation({ summary: 'This tenant\'s own settlement statements' })
  async list() {
    const settlements = await this.settlements.listForCurrentTenant();
    return Promise.all(settlements.map((s) => this.settlements.toResponse(s)));
  }

  @Get('console/settlements/:id')
  @Permissions('settlement:read')
  @ApiOperation({ summary: 'Get one of this tenant\'s own settlements' })
  async get(@Param('id') id: string) {
    return this.settlements.toResponse(await this.settlements.getForCurrentTenant(id));
  }

  @Get('console/settlements/:id/export')
  @Permissions('settlement:export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV line-item export of one of this tenant\'s own settlements' })
  async exportOwn(@Param('id') id: string): Promise<RawResponse<string>> {
    return new RawResponse(await this.settlements.exportCsvForCurrentTenant(id));
  }

  // -------------------------------------------------------------------------
  // Platform administration
  // -------------------------------------------------------------------------

  @Post('platform/settlements/run')
  @Permissions('platform.settlement:run')
  @Validate(runSettlementBatchRequestSchema)
  @ApiOperation({ summary: 'Batch every beneficiary\'s unsettled commission-ledger entries for a period into settlements' })
  async runBatch(@Body() body: ReturnType<typeof runSettlementBatchRequestSchema.parse>) {
    const result = await this.settlements.runBatch(body.periodStart, body.periodEnd);
    return {
      created: await Promise.all(result.created.map((s) => this.settlements.toResponse(s))),
      skipped: result.skipped,
    };
  }

  @Get('platform/settlements/pending-approval')
  @Permissions('platform.settlement:read')
  @ApiOperation({ summary: 'Every settlement awaiting platform approval' })
  async pendingApproval() {
    const settlements = await this.settlements.pendingApprovalQueue();
    return Promise.all(settlements.map((s) => this.settlements.toResponse(s)));
  }

  @Post('platform/settlements/:id/approve')
  @Permissions('platform.settlement:approve')
  @ApiOperation({ summary: 'Approve a settlement for payout' })
  async approve(@Param('id') id: string, @CurrentUser('id') userId: string | undefined) {
    const settlement = await this.settlements.approve(id, userId ?? null);
    return this.settlements.toResponse(settlement);
  }

  @Post('platform/settlements/:id/processing')
  @Permissions('platform.settlement:approve')
  @ApiOperation({ summary: 'Mark an approved settlement as processing (payout initiated)' })
  async markProcessing(@Param('id') id: string) {
    return this.settlements.toResponse(await this.settlements.markProcessing(id));
  }

  @Post('platform/settlements/:id/paid')
  @Permissions('platform.settlement:pay')
  @Validate(markSettlementPaidRequestSchema)
  @ApiOperation({ summary: 'Mark a settlement paid (or collected, for a negative net-payable) with its payout reference' })
  async markPaid(@Param('id') id: string, @Body() body: ReturnType<typeof markSettlementPaidRequestSchema.parse>) {
    const settlement = await this.settlements.markPaid(id, body.payoutMethod, body.payoutReference);
    return this.settlements.toResponse(settlement);
  }

  @Get('platform/settlements/:id/export')
  @Permissions('platform.settlement:export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV line-item export of any settlement' })
  async exportAny(@Param('id') id: string): Promise<RawResponse<string>> {
    return new RawResponse(await this.settlements.exportCsvGlobal(id));
  }
}
