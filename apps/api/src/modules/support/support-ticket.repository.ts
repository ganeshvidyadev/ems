import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { NotFoundError } from '@ems/kernel';
import { SupportTicketEntity, type SupportTicketStatus } from '../../database/entities';

/**
 * Plain repository, not `TenantScopedRepository` — `support_tickets` is
 * platform-global (see the entity's own doc comment): platform staff manage
 * every tenant's tickets uniformly, and a requester's own "my tickets" view
 * is an explicit `requesterUserId`/`tenantId` filter here, not an ambient scope.
 */
@Injectable()
export class SupportTicketRepository {
  private readonly repository: Repository<SupportTicketEntity>;

  constructor(@InjectEntityManager() private readonly manager: EntityManager) {
    this.repository = manager.getRepository(SupportTicketEntity);
  }

  generateTicketNumber(): string {
    return `TKT-${Date.now().toString(36).toUpperCase()}`;
  }

  create(data: Partial<SupportTicketEntity>): SupportTicketEntity {
    return this.repository.create(data);
  }

  async save(entity: SupportTicketEntity): Promise<SupportTicketEntity> {
    return this.repository.save(entity);
  }

  async findByPublicId(publicId: string): Promise<SupportTicketEntity | null> {
    return this.repository.findOne({ where: { publicId } });
  }

  async findByPublicIdOrFail(publicId: string): Promise<SupportTicketEntity> {
    const ticket = await this.findByPublicId(publicId);
    if (!ticket) throw new NotFoundError('SupportTicket', publicId);
    return ticket;
  }

  /** Platform view — every tenant's tickets, optionally filtered by status. */
  async listAll(status?: SupportTicketStatus): Promise<SupportTicketEntity[]> {
    return this.repository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** A requester's own tickets — the tenant self-service view. */
  async listForRequester(tenantId: string, requesterUserId: string, status?: SupportTicketStatus): Promise<SupportTicketEntity[]> {
    return this.repository.find({
      where: status ? { tenantId, requesterUserId, status } : { tenantId, requesterUserId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
