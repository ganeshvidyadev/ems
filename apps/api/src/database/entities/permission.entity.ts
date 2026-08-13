import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Global permission catalogue. Platform-scoped: the set of things that *can* be
 * done is a property of the software, not of any tenant, so tenants share it and
 * only their role→permission grants differ.
 */
@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  /** `resource:action`, e.g. `product:update`, `order:refund`. */
  @Index('uq_permissions_code', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  /** Denormalized from `code` so the UI can group by resource without parsing. */
  @Column({ type: 'varchar', length: 50 })
  resource!: string;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  /** TENANT permissions are grantable by merchants; PLATFORM ones never are. */
  @Index('idx_permissions_scope')
  @Column({ type: 'varchar', length: 32, default: 'TENANT' })
  scope!: 'TENANT' | 'PLATFORM';

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  static parse(code: string): { resource: string; action: string } {
    const [resource = '', action = ''] = code.split(':');
    return { resource, action };
  }
}
