import type { NotificationChannel } from '../../../database/entities';

export interface NotificationSendInput {
  recipientAddress: string | null;
  subject: string | null;
  body: string;
  actionUrl: string | null;
}

export interface NotificationSendResult {
  status: 'SENT' | 'FAILED' | 'SUPPRESSED';
  providerMessageId: string | null;
  errorMessage: string | null;
}

/**
 * One send per channel. Same "depend on intent, never on a provider SDK"
 * shape as `PaymentGatewayPort`/`ChannelAdapterPort` — `NotificationDispatchService`
 * never knows whether a channel is a real integration or an honest stub.
 */
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');
