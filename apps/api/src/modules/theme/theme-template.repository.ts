import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { ThemeTemplateEntity } from '../../database/entities';

/**
 * Plain repository, not `TenantScopedRepository` — `theme_templates` is
 * platform-global (the gallery every tenant sees is identical), so there is
 * no tenant predicate to inject.
 */
@Injectable()
export class ThemeTemplateRepository {
  private readonly repository: Repository<ThemeTemplateEntity>;

  constructor(@InjectEntityManager() manager: EntityManager) {
    this.repository = manager.getRepository(ThemeTemplateEntity);
  }

  async findActive(): Promise<ThemeTemplateEntity[]> {
    return this.repository.find({ where: { status: 'ACTIVE' }, order: { category: 'ASC', name: 'ASC' } });
  }

  async findByCode(code: string): Promise<ThemeTemplateEntity | null> {
    return this.repository.findOne({ where: { code } });
  }

  async findById(id: number): Promise<ThemeTemplateEntity | null> {
    return this.repository.findOne({ where: { id } });
  }
}
