import { newPublicId } from '@ems/kernel';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * Column type shared by every timestamp.
 *
 * `DATETIME(3)`, never `TIMESTAMP`: `TIMESTAMP` overflows in 2038 and — worse —
 * MySQL silently converts it to and from the session timezone, so the same row
 * reads back differently depending on which connection asked. `DATETIME` stores
 * exactly what we wrote, and we always write UTC.
 */
export const DATETIME3 = { type: 'datetime', precision: 3 } as const;

/**
 * `TINYINT(1)` ⇄ `boolean`.
 *
 * The mysql2 driver returns `TINYINT` as a number, so a column typed `boolean` in
 * TypeScript actually holds `0`/`1` at runtime. That is a genuine defect rather than a
 * cosmetic one: `0 && x` evaluates to `0`, JSON-serialises as `0`, and then fails a Zod
 * `z.boolean()` on the client — so a field the contract promises is a boolean arrives as
 * a number.
 *
 * Applied via `transformer` so the conversion happens once at the persistence boundary
 * instead of being re-remembered at every call site.
 */
export const BOOLEAN_COLUMN = {
  type: 'tinyint' as const,
  width: 1,
  transformer: {
    /**
     * `undefined` MUST pass through untouched.
     *
     * TypeORM decides whether to emit `DEFAULT` or a bound parameter based on whether the
     * property is `undefined`. Mapping `undefined` to `null` here makes the property look
     * "set", so TypeORM binds an explicit NULL — and a `NOT NULL DEFAULT 0` column rejects
     * the insert. That broke every user insert until it was caught, because the property is
     * normally left unset and expected to fall back to the column default.
     */
    to: (value: boolean | null | undefined): number | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value ? 1 : 0;
    },
    from: (value: number | boolean | null): boolean => value === 1 || value === true,
  },
};

/** Numeric id. `BIGINT UNSIGNED` is returned by mysql2 as a string. */
export abstract class NumericIdEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;
}

/**
 * The standard entity shape: internal numeric PK plus an external ULID.
 *
 * Two identifiers on purpose. The `BIGINT` PK keeps joins and indexes narrow;
 * the ULID is what APIs and URLs expose, so we never leak row counts or let a
 * caller enumerate `/orders/1`, `/orders/2`, … across a tenant boundary.
 */
export abstract class BaseEntity extends NumericIdEntity {
  @Column({ name: 'public_id', type: 'char', length: 26 })
  publicId!: string;

  @CreateDateColumn({ name: 'created_at', ...DATETIME3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', ...DATETIME3 })
  updatedAt!: Date;

  @BeforeInsert()
  protected assignPublicId(): void {
    // Monotonic ULID: lexicographic order matches creation order, so the index
    // on public_id clusters chronologically instead of scattering writes.
    if (!this.publicId) this.publicId = newPublicId();
  }
}

/** Adds soft delete. Applied to merchant-visible entities only. */
export abstract class SoftDeletableEntity extends BaseEntity {
  @DeleteDateColumn({ name: 'deleted_at', ...DATETIME3, nullable: true })
  deletedAt!: Date | null;
}

/**
 * Adds optimistic locking. Applied to concurrently-mutated rows — orders,
 * inventory levels, subscriptions — where a lost update is a real, expensive bug
 * (two admins refunding the same order, two checkouts decrementing the same stock).
 */
export abstract class VersionedEntity extends SoftDeletableEntity {
  @VersionColumn({ name: 'version', type: 'int', unsigned: true, default: 0 })
  version!: number;
}

/**
 * Tenant-owned entity base.
 *
 * `tenantId` is writable but is stamped automatically by `TenantGuardSubscriber`
 * from the AsyncLocalStorage context; application code should never set it by
 * hand, and the subscriber throws if it disagrees with the active context.
 */
export abstract class TenantOwnedEntity extends SoftDeletableEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;
}

export abstract class VersionedTenantOwnedEntity extends VersionedEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;
}
