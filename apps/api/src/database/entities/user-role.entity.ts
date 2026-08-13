import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME3 } from './base.entity';
import { RoleEntity } from './role.entity';
import { UserEntity } from './user.entity';

/**
 * Role grant, optionally scoped to a single store of a multi-store tenant.
 *
 * Surrogate PK plus `UNIQUE (user_id, role_id, store_scope)`, where `store_scope`
 * is a stored generated column over `IFNULL(store_id, 0)`. Two reasons it is not
 * a natural composite key: MySQL forbids functional key parts in a PRIMARY KEY,
 * and MySQL treats NULLs as distinct in a unique index — so a plain
 * `UNIQUE (user_id, role_id, store_id)` would happily accept the same
 * tenant-wide grant any number of times.
 */
@Entity('user_roles')
export class UserRoleEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @Column({ name: 'role_id', type: 'int', unsigned: true })
  roleId!: number;

  /** NULL ⇒ the grant applies across every store of the tenant. */
  @Column({ name: 'store_id', type: 'bigint', unsigned: true, nullable: true })
  storeId!: string | null;

  @Column({ name: 'granted_by', type: 'bigint', unsigned: true, nullable: true })
  grantedBy!: string | null;

  @Column({ name: 'granted_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  grantedAt!: Date;

  /**
   * Temporary elevation — contractor access, time-boxed support impersonation.
   * A nightly job sweeps expired grants; the permission resolver also filters on
   * this, so an expired grant stops working immediately rather than at sweep time.
   */
  @Index('idx_user_roles_expiry')
  @Column({ name: 'expires_at', ...DATETIME3, nullable: true })
  expiresAt!: Date | null;

  @ManyToOne(() => UserEntity, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => RoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: RoleEntity;

  get isExpired(): boolean {
    return this.expiresAt !== null && this.expiresAt.getTime() <= Date.now();
  }
}
