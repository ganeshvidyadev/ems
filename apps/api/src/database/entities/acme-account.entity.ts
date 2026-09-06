import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME3 } from './base.entity';

/**
 * The platform's own ACME account — one row per directory URL (staging vs
 * production are different accounts at Let's Encrypt), shared across every
 * tenant's certificate. Platform-global, not `@TenantScoped()`: see
 * `PLATFORM_GLOBAL_ENTITIES` in `tenant-scoped.decorator.ts`.
 */
@Entity('acme_accounts')
export class AcmeAccountEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Index('uq_acme_accounts_directory', { unique: true })
  @Column({ name: 'directory_url', type: 'varchar', length: 500 })
  directoryUrl!: string;

  /** The CA-assigned account resource URL — this is the JWS `kid` for every request after `newAccount`. */
  @Column({ name: 'account_url', type: 'varchar', length: 500 })
  accountUrl!: string;

  /** AES-256-GCM ciphertext of the account's RSA private key (PEM), via `CryptoService`. */
  @Column({ name: 'private_key_encrypted', type: 'mediumblob' })
  privateKeyEncrypted!: Buffer;

  /** RFC 7638 thumbprint of the account public key — reused to build every DNS-01 `keyAuthorization`. */
  @Column({ name: 'jwk_thumbprint', type: 'varchar', length: 64 })
  jwkThumbprint!: string;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    ...DATETIME3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt!: Date;
}
