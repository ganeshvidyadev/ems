import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';

const SETTING_GROUP = 'seo';

/**
 * Store-level SEO settings, using the generic `store_settings` key/value
 * table already established in docs/02 §6 for exactly this shape — a new
 * setting ships without a migration, the same reasoning that table's own
 * doc comment gives.
 */
@Injectable()
export class SeoSettingsRepository {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly context: RequestContextService,
  ) {}

  private get tenantId(): string {
    return this.context.requireTenantId('SEO settings');
  }

  async getAll(storeId: string): Promise<Record<string, unknown>> {
    const rows = (await this.manager.query(
      `SELECT setting_key AS settingKey, setting_value AS settingValue
         FROM store_settings
        WHERE tenant_id = ? AND store_id = ? AND setting_group = ?`,
      [this.tenantId, storeId, SETTING_GROUP],
    )) as { settingKey: string; settingValue: string }[];

    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[toCamelCase(row.settingKey)] = JSON.parse(row.settingValue);
    }
    return settings;
  }

  async setMany(storeId: string, values: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const settingKey = toSnakeCase(key);
      await this.manager.query(
        `INSERT INTO store_settings (tenant_id, store_id, setting_group, setting_key, setting_value)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW(3)`,
        [this.tenantId, storeId, SETTING_GROUP, settingKey, JSON.stringify(value)],
      );
    }
  }

  async resolveStoreId(storePublicId: string): Promise<string | null> {
    const rows = (await this.manager.query(
      `SELECT id FROM stores WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [storePublicId, this.tenantId],
    )) as { id: string }[];
    return rows[0]?.id ?? null;
  }

  /** The store's primary hostname (custom domain if verified, else its subdomain) — the sitemap's base URL. */
  async primaryHostname(storeId: string): Promise<string | null> {
    const rows = (await this.manager.query(
      `SELECT hostname FROM tenant_domains
        WHERE tenant_id = ? AND (store_id = ? OR store_id IS NULL) AND is_primary = 1
        ORDER BY (store_id IS NOT NULL) DESC
        LIMIT 1`,
      [this.tenantId, storeId],
    )) as { hostname: string }[];
    return rows[0]?.hostname ?? null;
  }
}

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function toSnakeCase(camel: string): string {
  return camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
