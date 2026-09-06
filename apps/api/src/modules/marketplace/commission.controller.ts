import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { commissionLedgerEntryResponseSchema, type CommissionLedgerEntryResponse } from '@ems/contracts';
import { Permissions } from '../../common/decorators';
import { RequestContextService } from '../../common/services/request-context.service';
import type { CommissionLedgerEntity } from '../../database/entities';
import { CommissionLedgerRepository } from './commission-ledger.repository';

@ApiTags('commission')
@Controller({ version: '1' })
export class CommissionController {
  constructor(
    private readonly ledger: CommissionLedgerRepository,
    private readonly context: RequestContextService,
  ) {}

  @Get('console/commission/ledger')
  @Permissions('commission:read')
  @ApiOperation({ summary: 'This tenant\'s own commission-ledger entries — earnings as a supplier or reseller, and platform fees paid' })
  async ledgerForCurrentTenant(@Query('settled') settled?: string): Promise<CommissionLedgerEntryResponse[]> {
    const tenantId = this.context.requireTenantId('commission ledger');
    const entries = await this.ledger.findForBeneficiary(tenantId, {
      settled: settled === undefined ? undefined : settled === 'true',
    });
    return entries.map(toResponse);
  }
}

function toResponse(entry: CommissionLedgerEntity): CommissionLedgerEntryResponse {
  return commissionLedgerEntryResponseSchema.parse({
    id: entry.publicId,
    orderId: entry.orderId,
    entryType: entry.entryType,
    direction: entry.direction,
    beneficiaryType: entry.beneficiaryType,
    grossMinor: entry.grossMinor,
    commissionMinor: entry.commissionMinor,
    platformFeeMinor: entry.platformFeeMinor,
    taxMinor: entry.taxMinor,
    netMinor: entry.netMinor,
    currency: entry.currency,
    settled: entry.settlementId !== null,
    description: entry.description,
    createdAt: entry.createdAt.toISOString(),
  });
}
