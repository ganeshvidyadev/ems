import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listNotificationsQuerySchema,
  upsertNotificationTemplateRequestSchema,
  type NotificationResponse,
  type NotificationTemplateResponse,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequestContextService } from '../../common/services/request-context.service';
import type { NotificationEntity } from '../../database/entities';
import { NotificationRepository } from './notification.repository';
import { NotificationTemplateService } from './notification-template.service';

@ApiTags('notifications')
@Controller({ version: '1' })
export class NotificationController {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly templates: NotificationTemplateService,
    private readonly context: RequestContextService,
  ) {}

  @Get('console/notifications')
  @Permissions('notification:read')
  @ApiOperation({ summary: "List the signed-in user's own notifications" })
  async listMine(
    @Query(new ZodValidationPipe(listNotificationsQuerySchema))
    query: ReturnType<typeof listNotificationsQuerySchema.parse>,
  ): Promise<NotificationResponse[]> {
    const userId = this.context.require('list notifications').userId;
    if (!userId) return [];
    const { items } = await this.notifications.listForRecipient('USER', userId, query.unreadOnly, query.page, query.limit);
    return items.map(toNotificationResponse);
  }

  @Post('console/notifications/:id/read')
  @Permissions('notification:read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(@Param('id') id: string): Promise<NotificationResponse> {
    return toNotificationResponse(await this.notifications.markRead(id));
  }

  @Get('console/notification-templates')
  @Permissions('notification:configure')
  @ApiOperation({ summary: "List this tenant's notification template overrides" })
  async listTemplates(): Promise<NotificationTemplateResponse[]> {
    const templates = await this.templates.list();
    return templates.map((t) => this.templates.toResponse(t));
  }

  @Put('console/notification-templates')
  @Permissions('notification:configure')
  @Validate(upsertNotificationTemplateRequestSchema)
  @ApiOperation({ summary: "Create or update this tenant's override for one (code, channel, locale)" })
  async upsertTemplate(
    @Body() body: ReturnType<typeof upsertNotificationTemplateRequestSchema.parse>,
  ): Promise<NotificationTemplateResponse> {
    return this.templates.toResponse(await this.templates.upsert(body));
  }
}

function toNotificationResponse(notification: NotificationEntity): NotificationResponse {
  return {
    id: notification.id,
    recipientType: notification.recipientType,
    recipientId: notification.recipientId,
    channel: notification.channel,
    templateCode: notification.templateCode,
    title: notification.title,
    body: notification.body,
    actionUrl: notification.actionUrl,
    status: notification.status,
    isUnread: notification.isUnread,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    sentAt: notification.sentAt?.toISOString() ?? null,
  };
}
