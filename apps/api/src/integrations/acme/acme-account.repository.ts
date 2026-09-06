import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AcmeAccountEntity } from '../../database/entities';

/**
 * Plain repository, not `TenantScopedRepository` — `acme_accounts` is
 * platform-global, the same reasoning as `ThemeTemplateRepository`.
 */
@Injectable()
export class AcmeAccountRepository {
  private readonly repository: Repository<AcmeAccountEntity>;

  constructor(@InjectEntityManager() manager: EntityManager) {
    this.repository = manager.getRepository(AcmeAccountEntity);
  }

  async findByDirectory(directoryUrl: string): Promise<AcmeAccountEntity | null> {
    return this.repository.findOne({ where: { directoryUrl } });
  }

  async create(data: Pick<AcmeAccountEntity, 'directoryUrl' | 'accountUrl' | 'privateKeyEncrypted' | 'jwkThumbprint'>): Promise<AcmeAccountEntity> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
