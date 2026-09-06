import type { DataSource } from 'typeorm';
import { NotificationTemplateEntity, type NotificationChannel } from '../entities/notification-template.entity';

interface TemplateSpec {
  code: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  variables: string[];
}

/**
 * Platform-default templates (`tenant_id IS NULL`, `is_system = true`) for
 * every event `NotificationProcessor` (queues/processors) knows how to route.
 * A tenant can override any one of these via `PUT console/notification-templates`
 * without touching this seed — see `NotificationTemplateRepository.resolve`.
 */
export const NOTIFICATION_TEMPLATE_SPECS: readonly TemplateSpec[] = [
  {
    code: 'TENANT_WELCOME',
    channel: 'EMAIL',
    subject: 'Welcome to EMS, {{businessName}}',
    body: 'Thanks for signing up! Your store "{{businessName}}" is being set up now — we will let you know the moment it is ready.',
    variables: ['businessName'],
  },
  {
    code: 'STORE_READY',
    channel: 'EMAIL',
    subject: 'Your store is ready',
    body: 'Hi {{firstName}}, your store has been provisioned and is ready to configure.',
    variables: ['firstName'],
  },
  {
    code: 'STORE_READY',
    channel: 'IN_APP',
    subject: 'Store ready',
    body: 'Your store has finished provisioning and is ready to configure.',
    variables: [],
  },
  {
    code: 'PROVISIONING_FAILED',
    channel: 'EMAIL',
    subject: 'We hit a snag setting up your store',
    body: 'Hi {{firstName}}, provisioning your store failed: {{message}}. Our team has been notified and you can retry from your dashboard.',
    variables: ['firstName', 'message'],
  },
  {
    code: 'PROVISIONING_FAILED',
    channel: 'IN_APP',
    subject: 'Provisioning failed',
    body: 'Store setup failed: {{message}}. You can retry from Settings.',
    variables: ['message'],
  },
  {
    code: 'SUBSCRIPTION_RENEWED',
    channel: 'EMAIL',
    subject: 'Your subscription has renewed',
    body: 'Hi {{firstName}}, your EMS subscription has renewed successfully.',
    variables: ['firstName'],
  },
  {
    code: 'SUBSCRIPTION_PAYMENT_FAILED',
    channel: 'EMAIL',
    subject: 'Action needed: subscription payment failed',
    body: 'Hi {{firstName}}, we were unable to charge your subscription. Please update your payment method to avoid a service interruption.',
    variables: ['firstName'],
  },
  {
    code: 'SUBSCRIPTION_PAYMENT_FAILED',
    channel: 'IN_APP',
    subject: 'Payment failed',
    body: 'We could not charge your subscription. Update your payment method to avoid an interruption.',
    variables: [],
  },
  {
    code: 'SUBSCRIPTION_SUSPENDED',
    channel: 'EMAIL',
    subject: 'Your subscription has been suspended',
    body: 'Hi {{firstName}}, your subscription is suspended after repeated failed payments. Update your payment method to restore access.',
    variables: ['firstName'],
  },
  {
    code: 'SUBSCRIPTION_SUSPENDED',
    channel: 'IN_APP',
    subject: 'Subscription suspended',
    body: 'Your subscription is suspended. Update your payment method to restore access.',
    variables: [],
  },
  {
    code: 'SUBSCRIPTION_CANCELLED',
    channel: 'EMAIL',
    subject: 'Your subscription has been cancelled',
    body: 'Hi {{firstName}}, your EMS subscription has been cancelled as requested.',
    variables: ['firstName'],
  },
  {
    code: 'SUBSCRIPTION_REACTIVATED',
    channel: 'EMAIL',
    subject: 'Your subscription is active again',
    body: 'Hi {{firstName}}, your EMS subscription has been reactivated.',
    variables: ['firstName'],
  },
  {
    code: 'BILLING_PAYMENT_RECEIVED',
    channel: 'EMAIL',
    subject: 'Payment received',
    body: 'Hi {{firstName}}, we received your subscription payment of {{amountMinor}} minor units. Thank you.',
    variables: ['firstName', 'amountMinor'],
  },
  {
    code: 'CHANNEL_TOKEN_EXPIRED',
    channel: 'EMAIL',
    subject: 'A sales channel needs reconnecting',
    body: 'Hi {{firstName}}, one of your connected sales channels has an expired token. Reconnect it from Channels to resume syncing.',
    variables: ['firstName'],
  },
  {
    code: 'CHANNEL_TOKEN_EXPIRED',
    channel: 'IN_APP',
    subject: 'Channel needs reconnecting',
    body: 'A connected sales channel has an expired token. Reconnect it to resume syncing.',
    variables: [],
  },
  {
    code: 'ORDER_CONFIRMATION',
    channel: 'EMAIL',
    subject: 'Order {{orderNumber}} confirmed',
    body: 'Thanks for your order! Order {{orderNumber}} is confirmed for a total of {{totalMinor}} {{currency}} (minor units).',
    variables: ['orderNumber', 'totalMinor', 'currency'],
  },
  {
    code: 'SHIPMENT_DISPATCHED',
    channel: 'EMAIL',
    subject: 'Order {{orderNumber}} has shipped',
    body: 'Your order {{orderNumber}} has shipped via {{carrier}}. Tracking number: {{awbNumber}}.',
    variables: ['orderNumber', 'carrier', 'awbNumber'],
  },
  {
    code: 'SHIPMENT_DELIVERED',
    channel: 'EMAIL',
    subject: 'Order {{orderNumber}} delivered',
    body: 'Your order {{orderNumber}} has been delivered. We hope you enjoy it!',
    variables: ['orderNumber'],
  },
];

/** Idempotent upsert, matched by (code, channel, locale) — same reasoning as `seedThemeTemplates`. */
export async function seedNotificationTemplates(dataSource: DataSource): Promise<number> {
  const repo = dataSource.getRepository(NotificationTemplateEntity);

  for (const spec of NOTIFICATION_TEMPLATE_SPECS) {
    let template = await repo.findOne({
      where: { code: spec.code, channel: spec.channel, locale: 'en', tenantId: null as never },
    });

    if (template) {
      template.subject = spec.subject;
      template.body = spec.body;
      template.variables = spec.variables;
      template.isActive = true;
      template.isSystem = true;
    } else {
      template = repo.create({
        tenantId: null,
        isSystem: true,
        code: spec.code,
        channel: spec.channel,
        locale: 'en',
        subject: spec.subject,
        body: spec.body,
        variables: spec.variables,
        isActive: true,
      });
    }

    await repo.save(template);
  }

  return NOTIFICATION_TEMPLATE_SPECS.length;
}
