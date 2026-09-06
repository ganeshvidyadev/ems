import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '../../../database/entities';
import type { NotificationProvider, NotificationSendInput, NotificationSendResult } from './notification-provider.port';

/**
 * Genuinely real, not a stub: the `notifications` row itself **is** the
 * delivery — the console/storefront reads it back through the list endpoint.
 * There is no external provider to fail against, so this always succeeds.
 */
@Injectable()
export class InAppNotificationProvider implements NotificationProvider {
  readonly channel: NotificationChannel = 'IN_APP';

  async send(_input: NotificationSendInput): Promise<NotificationSendResult> {
    return { status: 'SENT', providerMessageId: null, errorMessage: null };
  }
}
