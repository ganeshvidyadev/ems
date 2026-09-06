import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel } from '../../../database/entities';
import type { NotificationProvider, NotificationSendInput, NotificationSendResult } from './notification-provider.port';

/**
 * SMS, WhatsApp and push all need a credentialed provider (an approved DLT
 * sender id, a WhatsApp Business template, an FCM/APNs key) that isn't
 * available in this environment — the same "pending external approval"
 * honesty `ChannelAdapterFactory` already applies to Amazon/Flipkart/Facebook.
 * Logged and recorded `SUPPRESSED`, never faked as sent.
 */
@Injectable()
export class StubNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(StubNotificationProvider.name);

  constructor(readonly channel: NotificationChannel) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    this.logger.warn(
      `${this.channel} notification suppressed (no credentialed provider configured): "${input.subject ?? input.body.slice(0, 40)}"`,
    );
    return {
      status: 'SUPPRESSED',
      providerMessageId: null,
      errorMessage: `${this.channel} requires a pending-external-approval provider — not yet available`,
    };
  }
}
