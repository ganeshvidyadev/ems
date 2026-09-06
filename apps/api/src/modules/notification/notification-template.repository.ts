import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { NotificationTemplateEntity, type NotificationChannel } from '../../database/entities';
import { RequestContextService } from '../../common/services/request-context.service';
import { TenantScopedRepository } from '../../database/repositories/tenant-scoped.repository';

interface TemplateRow {
  id: string;
  tenantId: string | null;
  isSystem: number;
  code: string;
  channel: NotificationChannel;
  locale: string;
  subject: string | null;
  body: string;
  providerTemplateId: string | null;
  variables: string[] | null;
  isActive: number;
}

@Injectable()
export class NotificationTemplateRepository extends TenantScopedRepository<NotificationTemplateEntity> {
  constructor(
    @InjectEntityManager() manager: EntityManager,
    context: RequestContextService,
  ) {
    super(manager, NotificationTemplateEntity, context, 'tenantId');
  }

  /**
   * A tenant's own override wins over the platform default (`tenant_id IS NULL`).
   * Not expressible through `TenantScopedRepository.scopeWhere` — that always
   * requires an exact tenant match, never an OR against NULL — so this goes
   * around it with a raw query the same way `NotificationTemplateEntity`'s own
   * doc comment describes the fallback.
   */
  async resolve(code: string, channel: NotificationChannel, locale: string): Promise<NotificationTemplateEntity | null> {
    const tenantId = this.tenantId;
    const rows = (await this.manager.query(
      `SELECT id, tenant_id AS tenantId, is_system AS isSystem, code, channel, locale, subject, body,
              provider_template_id AS providerTemplateId, variables, is_active AS isActive
         FROM notification_templates
        WHERE (tenant_id = ? OR tenant_id IS NULL)
          AND code = ? AND channel = ? AND locale = ? AND is_active = 1
        ORDER BY (tenant_id IS NULL) ASC
        LIMIT 1`,
      [tenantId, code, channel, locale],
    )) as TemplateRow[];

    const row = rows[0];
    if (!row) return null;
    return this.rowToEntity(row);
  }

  /** Falls back to the `en` platform default when the requested locale has no override at all. */
  async resolveWithFallback(code: string, channel: NotificationChannel, locale: string): Promise<NotificationTemplateEntity | null> {
    return (await this.resolve(code, channel, locale)) ?? (locale === 'en' ? null : this.resolve(code, channel, 'en'));
  }

  async listForTenant(): Promise<NotificationTemplateEntity[]> {
    return this.find({ order: { code: 'ASC', channel: 'ASC' } as never });
  }

  private rowToEntity(row: TemplateRow): NotificationTemplateEntity {
    const entity = new NotificationTemplateEntity();
    entity.id = row.id;
    entity.tenantId = row.tenantId;
    entity.isSystem = row.isSystem === 1;
    entity.code = row.code;
    entity.channel = row.channel;
    entity.locale = row.locale;
    entity.subject = row.subject;
    entity.body = row.body;
    entity.providerTemplateId = row.providerTemplateId;
    entity.variables = row.variables;
    entity.isActive = row.isActive === 1;
    return entity;
  }
}
