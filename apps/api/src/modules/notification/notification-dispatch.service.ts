import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationEntity, NotificationRecipientType } from '../../database/entities';
import { NotificationRepository } from './notification.repository';
import { NotificationTemplateRepository } from './notification-template.repository';
import { renderTemplate } from './template-renderer.util';
import { NOTIFICATION_PROVIDERS } from './notification-providers.token';
import type { NotificationProvider } from './providers/notification-provider.port';

export interface DispatchNotificationInput {
  recipientType: NotificationRecipientType;
  recipientId: string | null;
  recipientAddress: string | null;
  channel: NotificationChannel;
  templateCode: string;
  locale?: string;
  variables: Record<string, string>;
  actionUrl?: string | null;
}

/**
 * Renders a template, records the attempt, and hands it to the channel's
 * provider — the one place a queued event becomes an actual message.
 *
 * Deliberately never throws: a notification is a side effect of something
 * that already happened (an order was placed, a token expired), not the
 * thing itself, so a send failure must not fail the job that discovered it —
 * it is recorded `FAILED`/`SUPPRESSED` and left visible, the same "never
 * throws" contract `MailService.send` already keeps.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly notifications: NotificationRepository,
    private readonly templates: NotificationTemplateRepository,
    @Inject(NOTIFICATION_PROVIDERS) private readonly providers: Map<NotificationChannel, NotificationProvider>,
  ) {}

  async dispatch(input: DispatchNotificationInput): Promise<NotificationEntity | null> {
    const locale = input.locale ?? 'en';
    const template = await this.templates.resolveWithFallback(input.templateCode, input.channel, locale);

    if (!template) {
      this.logger.warn(`No active ${input.channel} template for code '${input.templateCode}' (locale ${locale}); skipping`);
      return null;
    }

    const subject = template.subject ? renderTemplate(template.subject, input.variables) : null;
    const body = renderTemplate(template.body, input.variables);

    const notification = await this.notifications.insert({
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      channel: input.channel,
      templateCode: input.templateCode,
      title: subject,
      body,
      actionUrl: input.actionUrl ?? null,
      status: 'SENDING',
    });

    const provider = this.providers.get(input.channel);
    if (!provider) {
      notification.status = 'FAILED';
      notification.errorMessage = `No provider registered for channel ${input.channel}`;
      await this.notifications.save(notification);
      return notification;
    }

    const result = await provider.send({
      recipientAddress: input.recipientAddress,
      subject,
      body,
      actionUrl: input.actionUrl ?? null,
    });

    notification.status = result.status;
    notification.providerMessageId = result.providerMessageId;
    notification.errorMessage = result.errorMessage;
    notification.attempts += 1;
    if (result.status === 'SENT') notification.sentAt = new Date();
    await this.notifications.save(notification);

    return notification;
  }
}
