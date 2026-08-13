import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Outbound notifications.
 *
 * Email only for now. SMS, WhatsApp and push arrive in Phase 11 behind the same shape,
 * so callers depend on an intent ("send this invitation") rather than a channel.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class NotificationModule {}
