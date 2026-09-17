import { Module } from '@nestjs/common';
import { SupportTicketRepository } from './support-ticket.repository';
import { SupportTicketMessageRepository } from './support-ticket-message.repository';
import { SupportTicketService } from './support-ticket.service';
import { SupportTicketController } from './support-ticket.controller';

@Module({
  controllers: [SupportTicketController],
  providers: [SupportTicketRepository, SupportTicketMessageRepository, SupportTicketService],
  // For PlatformAlertModule's SLA-breach check — reusing `findBreachedAcrossTenants()`
  // rather than a second raw-SQL copy of the same query.
  exports: [SupportTicketRepository],
})
export class SupportModule {}
