import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { NotFoundError } from '@ems/kernel';
import { SupportTicketEntity, type SupportTicketStatus } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

/**
 * Tenant-scoped like any other tenant-owned table (see the entity's own doc
 * comment for why it wasn't, and the bug that caused — SEC-001).
 *
 * The two `*AcrossTenants` methods are the deliberate exception: platform
 * staff manage every tenant's tickets uniformly, so they go through
 * `this.repository` directly rather than the scoped `find`/`findOne`. That
 * makes "no tenant filter here" visible in the method itself. Callers MUST
 * verify `context.isPlatformRequest` before calling either — this repository
 * does not check permissions, the controller/service layer does.
 */
@Injectable()
export class SupportTicketRepository extends TenantScopedRepository<SupportTicketEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, SupportTicketEntity, context);
  }

  generateTicketNumber(): string {
    return `TKT-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Platform view — every tenant's tickets, optionally filtered by status. */
  async listAllAcrossTenants(status?: SupportTicketStatus): Promise<SupportTicketEntity[]> {
    return this.repository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** Platform lookup by id, any tenant. */
  async findByPublicIdAcrossTenantsOrFail(publicId: string): Promise<SupportTicketEntity> {
    const ticket = await this.repository.findOne({ where: { publicId } });
    if (!ticket) throw new NotFoundError('SupportTicket', publicId);
    return ticket;
  }

  /** A tenant's own tickets, every requester — the tenant-wide self-service view. */
  async listForTenant(status?: SupportTicketStatus): Promise<SupportTicketEntity[]> {
    return this.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' } as never,
      take: 200,
    });
  }

  /** One requester's own tickets specifically — narrower than `listForTenant`. */
  async listForRequester(requesterUserId: string, status?: SupportTicketStatus): Promise<SupportTicketEntity[]> {
    return this.find({
      where: status ? { requesterUserId, status } : { requesterUserId },
      order: { createdAt: 'DESC' } as never,
      take: 200,
    });
  }
}
