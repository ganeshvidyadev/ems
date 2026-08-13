import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME3, BOOLEAN_COLUMN } from './base.entity';
import { PermissionEntity } from './permission.entity';
import { TenantEntity } from './tenant.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/** Codes seeded by `roles.seed.ts` and referenced by guards. */
export const SYSTEM_ROLE_CODES = [
  'PLATFORM_SUPER_ADMIN',
  'PLATFORM_SUPPORT',
  'PLATFORM_BILLING',
  'STORE_OWNER',
  'STORE_ADMIN',
  'PRODUCT_MANAGER',
  'ORDER_MANAGER',
  'INVENTORY_MANAGER',
  'MARKETING_MANAGER',
  'CUSTOMER_SUPPORT',
  'SUPPLIER',
  'RESELLER',
] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

/**
 * A role is either a shared system role (`tenant_id IS NULL`) or a tenant's own
 * custom role. `allowNullTenant` is what lets one seeded `STORE_ADMIN` definition
 * serve every tenant instead of being duplicated per signup — with thousands of
 * tenants that duplication would be thousands of identical rows to keep in sync
 * whenever a permission is added.
 */
@Entity('roles')
@TenantScoped({ allowNullTenant: true })
export class RoleEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true, nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 32, default: 'TENANT' })
  scope!: 'TENANT' | 'PLATFORM';

  /** System roles are immutable: editing them would change behaviour for every tenant. */
  @Column({ name: 'is_system', ...BOOLEAN_COLUMN, default: 0 })
  isSystem!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity | null;

  @ManyToMany(() => PermissionEntity, { cascade: false })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions?: PermissionEntity[];

  get isSystemRole(): boolean {
    return this.isSystem || this.tenantId === null;
  }
}
