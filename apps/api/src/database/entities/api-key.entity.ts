import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, DATETIME3 } from './base.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/**
 * Machine credential for a tenant's server-to-server integrations.
 *
 * The plaintext key is shown exactly once, at creation, and only its SHA-256 is
 * stored — the same reasoning as refresh tokens: high-entropy server-generated
 * secret, so a fast hash is sufficient and bcrypt on every API call would be a
 * needless latency cost.
 *
 * `key_prefix` exists so the UI can show `ems_live_a1b2…` for identification
 * without keeping anything that could be replayed.
 */
@Entity('api_keys')
@TenantScoped()
export class ApiKeyEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'key_prefix', type: 'char', length: 12 })
  keyPrefix!: string;

  @Index('uq_api_keys_hash', { unique: true })
  @Column({ name: 'key_hash', type: 'char', length: 64 })
  keyHash!: string;

  @Column({ type: 'json' })
  scopes!: string[];

  @Column({ name: 'rate_limit_per_min', type: 'int', unsigned: true, default: 60 })
  rateLimitPerMin!: number;

  /** Optional CIDR allowlist — a leaked key is far less useful if it is IP-bound. */
  @Column({ name: 'allowed_ips', type: 'json', nullable: true })
  allowedIps!: string[] | null;

  @Column({ name: 'last_used_at', ...DATETIME3, nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', ...DATETIME3, nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', ...DATETIME3, nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  get isActive(): boolean {
    if (this.revokedAt !== null) return false;
    if (this.expiresAt !== null && this.expiresAt.getTime() <= Date.now()) return false;
    return true;
  }
}
