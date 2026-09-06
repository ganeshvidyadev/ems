import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { NotificationEntity, type NotificationRecipientType } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';
import type { PaginatedResult } from '../../database/repositories/tenant-scoped.repository';

@Injectable()
export class NotificationRepository extends TenantScopedRepository<NotificationEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, NotificationEntity, context, 'tenantId');
  }

  async listForRecipient(
    recipientType: NotificationRecipientType,
    recipientId: string,
    unreadOnly: boolean,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<NotificationEntity>> {
    return this.findAndCount({
      where: unreadOnly
        ? ({ recipientType, recipientId, readAt: null } as never)
        : ({ recipientType, recipientId } as never),
      order: { createdAt: 'DESC' } as never,
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async markRead(id: string): Promise<NotificationEntity> {
    const notification = await this.findOneOrFail({ where: { id } as never });
    if (notification.readAt === null) {
      notification.readAt = new Date();
      if (notification.status === 'SENT' || notification.status === 'DELIVERED') {
        notification.status = 'READ';
      }
      await this.save(notification);
    }
    return notification;
  }
}
