import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { SupportTicketMessageEntity } from '../../database/entities';

@Injectable()
export class SupportTicketMessageRepository {
  private readonly repository: Repository<SupportTicketMessageEntity>;

  constructor(@InjectEntityManager() private readonly manager: EntityManager) {
    this.repository = manager.getRepository(SupportTicketMessageEntity);
  }

  async insert(data: Partial<SupportTicketMessageEntity>): Promise<SupportTicketMessageEntity> {
    return this.repository.save(this.repository.create(data));
  }

  /** Internal notes are platform-staff-only — filtered out for a requester's own view. */
  async listForTicket(ticketId: string, includeInternal: boolean): Promise<SupportTicketMessageEntity[]> {
    return this.repository.find({
      where: includeInternal ? { ticketId } : { ticketId, isInternalNote: false },
      order: { createdAt: 'ASC' },
    });
  }
}
