import { Injectable } from '@nestjs/common';
import type { UpsertNotificationTemplateRequest } from '@ems/contracts';
import type { NotificationTemplateEntity } from '../../database/entities';
import { NotificationTemplateRepository } from './notification-template.repository';

@Injectable()
export class NotificationTemplateService {
  constructor(private readonly templates: NotificationTemplateRepository) {}

  async list(): Promise<NotificationTemplateEntity[]> {
    return this.templates.listForTenant();
  }

  /** Upserts the tenant's own override, matched by (code, channel, locale) — the platform default is never edited here. */
  async upsert(input: UpsertNotificationTemplateRequest): Promise<NotificationTemplateEntity> {
    const existing = await this.templates.findOne({
      where: { code: input.code, channel: input.channel, locale: input.locale } as never,
    });

    if (existing) {
      Object.assign(existing, {
        subject: input.subject ?? null,
        body: input.body,
        providerTemplateId: input.providerTemplateId ?? null,
        variables: input.variables ?? null,
        isActive: input.isActive,
      });
      return this.templates.save(existing) as Promise<NotificationTemplateEntity>;
    }

    return this.templates.insert({
      isSystem: false,
      code: input.code,
      channel: input.channel,
      locale: input.locale,
      subject: input.subject ?? null,
      body: input.body,
      providerTemplateId: input.providerTemplateId ?? null,
      variables: input.variables ?? null,
      isActive: input.isActive,
    });
  }

  toResponse(template: NotificationTemplateEntity) {
    return {
      id: template.id,
      tenantId: template.tenantId,
      isSystem: template.isSystem,
      code: template.code,
      channel: template.channel,
      locale: template.locale,
      subject: template.subject,
      body: template.body,
      providerTemplateId: template.providerTemplateId,
      variables: template.variables,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
