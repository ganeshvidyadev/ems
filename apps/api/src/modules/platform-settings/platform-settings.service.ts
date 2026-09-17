import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  MaintenanceModeSetting,
  PlatformDataRetention,
  PlatformFeatureFlags,
  PlatformSecurityPolicy,
  PlatformSettingsResponse,
  SupportSlaHoursSetting,
  UpdatePlatformSettingsRequest,
} from '@ems/contracts';
import { CacheService } from '../../common/services/cache.service';
import { PlatformSettingEntity, type PlatformSettingKey } from '../../database/entities';

const DEFAULT_MAINTENANCE_MODE: MaintenanceModeSetting = {
  enabled: false,
  message: 'The platform is temporarily down for maintenance.',
};

// Mirrors the constant `SupportTicketService` used before this settings store
// existed — same numbers, now overridable without a deploy.
const DEFAULT_SUPPORT_SLA_HOURS: SupportSlaHoursSetting = {
  URGENT: 4,
  HIGH: 8,
  NORMAL: 24,
  LOW: 72,
};

const DEFAULT_FEATURE_FLAGS: PlatformFeatureFlags = {
  enableMarketplace: true,
  enableCustomDomains: true,
  enableAdvancedAnalytics: true,
  betaStorefrontThemes: false,
  aiCopilotAssistant: false,
};

const DEFAULT_SECURITY_POLICY: PlatformSecurityPolicy = {
  sessionIdleTimeoutMinutes: 60,
  maxConcurrentSessionsPerUser: 10,
  enforceMfaForStaff: false,
};

const DEFAULT_DATA_RETENTION: PlatformDataRetention = {
  softDeleteRetentionDays: 30,
  auditLogRetentionDays: 365,
  autoPurgeDeletedTenants: false,
};

const CACHE_TTL_SECONDS = 30;

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  async getAll(): Promise<PlatformSettingsResponse> {
    const [maintenanceMode, supportSlaHours, featureFlags, securityPolicy, dataRetention] = await Promise.all([
      this.get('maintenance_mode', DEFAULT_MAINTENANCE_MODE),
      this.get('support_sla_hours', DEFAULT_SUPPORT_SLA_HOURS),
      this.get('feature_flags', DEFAULT_FEATURE_FLAGS),
      this.get('security_policy', DEFAULT_SECURITY_POLICY),
      this.get('data_retention', DEFAULT_DATA_RETENTION),
    ]);
    return { maintenanceMode, supportSlaHours, featureFlags, securityPolicy, dataRetention };
  }

  async update(input: UpdatePlatformSettingsRequest, actorId: string): Promise<PlatformSettingsResponse> {
    const repo = this.dataSource.getRepository(PlatformSettingEntity);

    if (input.maintenanceMode !== undefined) {
      await repo.save(repo.create({ key: 'maintenance_mode', value: input.maintenanceMode, updatedBy: actorId }));
      await this.cache.del(this.cacheKey('maintenance_mode'));
    }
    if (input.supportSlaHours !== undefined) {
      await repo.save(repo.create({ key: 'support_sla_hours', value: input.supportSlaHours, updatedBy: actorId }));
      await this.cache.del(this.cacheKey('support_sla_hours'));
    }
    if (input.featureFlags !== undefined) {
      const current = await this.get('feature_flags', DEFAULT_FEATURE_FLAGS);
      const merged = { ...current, ...input.featureFlags };
      await repo.save(repo.create({ key: 'feature_flags', value: merged, updatedBy: actorId }));
      await this.cache.del(this.cacheKey('feature_flags'));
    }
    if (input.securityPolicy !== undefined) {
      const current = await this.get('security_policy', DEFAULT_SECURITY_POLICY);
      const merged = { ...current, ...input.securityPolicy };
      await repo.save(repo.create({ key: 'security_policy', value: merged, updatedBy: actorId }));
      await this.cache.del(this.cacheKey('security_policy'));
    }
    if (input.dataRetention !== undefined) {
      const current = await this.get('data_retention', DEFAULT_DATA_RETENTION);
      const merged = { ...current, ...input.dataRetention };
      await repo.save(repo.create({ key: 'data_retention', value: merged, updatedBy: actorId }));
      await this.cache.del(this.cacheKey('data_retention'));
    }

    return this.getAll();
  }


  /** Used by `SupportTicketService` and the maintenance-mode guard — cached
   * briefly so neither hits this table on every request. */
  async get<T>(key: PlatformSettingKey, fallback: T): Promise<T> {
    const cached = await this.cache.get<T>(this.cacheKey(key));
    if (cached !== null) return cached;

    const row = await this.dataSource.getRepository(PlatformSettingEntity).findOne({ where: { key } });
    const value = (row?.value as T | undefined) ?? fallback;
    await this.cache.set(this.cacheKey(key), value, CACHE_TTL_SECONDS);
    return value;
  }

  private cacheKey(key: PlatformSettingKey): string {
    return `platform-setting:${key}`;
  }
}
