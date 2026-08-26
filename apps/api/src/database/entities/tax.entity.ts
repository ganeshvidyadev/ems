import { newPublicId } from '@ems/kernel';
import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

@Entity('tax_classes')
@TenantScoped()
export class TaxClassEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'public_id', type: 'char', length: 26 })
  publicId!: string;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'is_default', ...BOOLEAN_COLUMN, default: 0 })
  isDefault!: boolean;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @BeforeInsert()
  protected assignPublicId(): void {
    if (!this.publicId) this.publicId = newPublicId();
  }
}

/**
 * Rate history via `effectiveFrom`/`effectiveTo` — reprinting an old invoice must use the
 * rate that was live on the invoice date, not today's rate.
 */
@Entity('tax_rates')
@TenantScoped()
export class TaxRateEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'public_id', type: 'char', length: 26 })
  publicId!: string;

  @Index('idx_tax_rates_lookup')
  @Column({ name: 'tax_class_id', type: 'bigint', unsigned: true })
  taxClassId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode!: string | null;

  @Column({ name: 'postal_pattern', type: 'varchar', length: 64, nullable: true })
  postalPattern!: string | null;

  /** Percent, e.g. `18.0000` = 18%. Returned as a string by mysql2 — never coerce to Number for money math. */
  @Column({ type: 'decimal', precision: 7, scale: 4 })
  rate!: string;

  @Column({ ...BOOLEAN_COLUMN, default: 0 })
  compound!: boolean;

  @Column({ type: 'smallint', default: 0 })
  priority!: number;

  @Column({ name: 'is_inclusive', ...BOOLEAN_COLUMN, default: 0 })
  isInclusive!: boolean;

  /** e.g. `[{name:'CGST',rate:9},{name:'SGST',rate:9}]` for compound GST splits. */
  @Column({ type: 'json', nullable: true })
  components!: { name: string; rate: number }[] | null;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom!: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @ManyToOne(() => TaxClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tax_class_id' })
  taxClass?: TaxClassEntity;

  @BeforeInsert()
  protected assignPublicId(): void {
    if (!this.publicId) this.publicId = newPublicId();
  }
}
