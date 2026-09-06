import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '../../../database/entities';
import { MailService } from '../mail.service';
import type { NotificationProvider, NotificationSendInput, NotificationSendResult } from './notification-provider.port';

/** The one real Phase 11 channel — everything else this phase ships is an honest stub. */
@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel: NotificationChannel = 'EMAIL';

  constructor(private readonly mail: MailService) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (!input.recipientAddress) {
      return { status: 'SUPPRESSED', providerMessageId: null, errorMessage: 'No email address on file' };
    }

    const bodyWithLink = input.actionUrl ? `${input.body}\n\n${input.actionUrl}` : input.body;
    const sent = await this.mail.send({
      to: input.recipientAddress,
      subject: input.subject ?? '(no subject)',
      text: bodyWithLink,
      html: bodyWithLink.replace(/\n/g, '<br>'),
    });

    return sent
      ? { status: 'SENT', providerMessageId: null, errorMessage: null }
      : { status: 'FAILED', providerMessageId: null, errorMessage: 'SMTP send failed — see server logs' };
  }
}
