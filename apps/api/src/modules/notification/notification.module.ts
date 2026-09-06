import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationTemplateRepository } from './notification-template.repository';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NOTIFICATION_PROVIDERS } from './notification-providers.token';
import { EmailNotificationProvider } from './providers/email-notification.provider';
import { InAppNotificationProvider } from './providers/in-app-notification.provider';
import { StubNotificationProvider } from './providers/stub-notification.provider';
import type { NotificationChannel } from '../../database/entities';
import type { NotificationProvider } from './providers/notification-provider.port';

/**
 * Outbound notifications.
 *
 * Email and in-app are real; SMS, WhatsApp and push are registered as honest
 * stubs (see `StubNotificationProvider`'s own doc comment) — the same "one
 * real integration, be upfront about the rest" shape every external
 * integration in this codebase follows.
 */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [
    MailService,
    NotificationRepository,
    NotificationTemplateRepository,
    NotificationTemplateService,
    NotificationDispatchService,
    EmailNotificationProvider,
    InAppNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (email: EmailNotificationProvider, inApp: InAppNotificationProvider) => {
        const map = new Map<NotificationChannel, NotificationProvider>();
        map.set('EMAIL', email);
        map.set('IN_APP', inApp);
        map.set('SMS', new StubNotificationProvider('SMS'));
        map.set('WHATSAPP', new StubNotificationProvider('WHATSAPP'));
        map.set('PUSH', new StubNotificationProvider('PUSH'));
        return map;
      },
      inject: [EmailNotificationProvider, InAppNotificationProvider],
    },
  ],
  exports: [
    MailService,
    NotificationRepository,
    NotificationTemplateRepository,
    NotificationTemplateService,
    NotificationDispatchService,
  ],
})
export class NotificationModule {}
