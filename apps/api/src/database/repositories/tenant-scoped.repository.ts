import { NotFoundError } from '@ems/kernel';
import {
  type DeepPartial,
  type EntityManager,
  type EntityTarget,
  type FindManyOptions,
  type FindOneOptions,
  type FindOptionsWhere,
  type ObjectLiteral,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import type { RequestContextService } from '../../common/services/request-context.service';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/**
 * Isolation **layer 1** (docs/01 §4.2).
 *
 * Every read and write goes through a method that injects
 * `tenant_id = <context tenant>`. Application code never writes that predicate
 * itself, so it cannot forget it.
 *
 * The deliberate design choice here is that the tenant filter is **not optional**:
 * there is no `findAll({ allTenants: true })` convenience. Cross-tenant access
 * requires `RequestContextService.runWithoutTenant()`, which is verbose on purpose
 * — turning off isolation should be visible in a diff, not a boolean flag someone
 * flips to make a test pass.
 *
 * Raw `EntityManager` injection is confined to `infrastructure/` by an ESLint
 * boundary rule, so this is the only path most code has.
 */
export abstract class TenantScopedRepository<T extends ObjectLiteral> {
  protected readonly repository: Repository<T>;

  protected constructor(
    protected readonly manager: EntityManager,
    private readonly target: EntityTarget<T>,
    protected readonly context: RequestContextService,
    /** Column on the entity holding the discriminator. */
    protected readonly tenantColumn: keyof T & string = 'tenantId' as keyof T & string,
  ) {
    this.repository = manager.getRepository(target);
  }

  /** Human-readable entity name, used in `NotFoundError` messages. */
  protected get entityName(): string {
    return this.repository.metadata.name;
  }

  protected get tenantId(): string {
    return this.context.requireTenantId(`${this.entityName} query`);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Merges the tenant predicate into a caller-supplied `where`. */
  protected scopeWhere(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const tenantPredicate = { [this.tenantColumn]: this.tenantId } as FindOptionsWhere<T>;

    if (!where) return tenantPredicate;

    // An array of `where` objects is an OR in TypeORM, so the tenant predicate
    // has to be merged into EVERY branch. Merging into only the first would make
    // the other branches unscoped — the exact bug this class exists to prevent.
    if (Array.isArray(where)) {
      return where.map((clause) => ({ ...clause, ...tenantPredicate }));
    }

    return { ...where, ...tenantPredicate };
  }

  async findOne(options: FindOneOptions<T> = {}): Promise<T | null> {
    return this.repository.findOne({ ...options, where: this.scopeWhere(options.where) });
  }

  /** Throws `NotFoundError` (→ 404) rather than returning null. */
  async findOneOrFail(options: FindOneOptions<T> = {}): Promise<T> {
    const entity = await this.findOne(options);
    if (!entity) throw new NotFoundError(this.entityName);
    return entity;
  }

  async findByPublicId(publicId: string, options: Omit<FindOneOptions<T>, 'where'> = {}): Promise<T | null> {
    // `publicId` exists on every entity that extends BaseEntity, but T is only
    // constrained to ObjectLiteral here, so the assertion is unavoidable.
    return this.findOne({
      ...options,
      where: { publicId } as unknown as FindOptionsWhere<T>,
    });
  }

  /**
   * Public-id lookup that 404s when missing **or** owned by another tenant.
   *
   * 404 and not 403: a 403 confirms the row exists, which lets an attacker
   * enumerate a competitor's order ids (docs/04 §3). Because the tenant predicate
   * is part of the query, "another tenant's row" and "no such row" are literally
   * the same outcome here — the leak is impossible rather than merely avoided.
   */
  async findByPublicIdOrFail(
    publicId: string,
    options: Omit<FindOneOptions<T>, 'where'> = {},
  ): Promise<T> {
    const entity = await this.findByPublicId(publicId, options);
    if (!entity) throw new NotFoundError(this.entityName, publicId);
    return entity;
  }

  async find(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find({ ...options, where: this.scopeWhere(options.where) });
  }

  async findAndCount(options: FindManyOptions<T> = {}): Promise<PaginatedResult<T>> {
    const [items, total] = await this.repository.findAndCount({
      ...options,
      where: this.scopeWhere(options.where),
    });
    return { items, total };
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where: this.scopeWhere(where) });
  }

  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    return (await this.count(where)) > 0;
  }

  /**
   * Query builder with the tenant predicate already applied.
   *
   * Callers must use `andWhere` from here on. A subsequent `.where()` would
   * *replace* the tenant predicate rather than add to it — the single easiest way
   * to write a cross-tenant query by accident, which is why this returns a builder
   * that is already constrained instead of a bare one.
   */
  protected scopedQueryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.${String(this.tenantColumn)} = :ctxTenantId`, { ctxTenantId: this.tenantId });
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** Instantiates with `tenant_id` pre-set; the subscriber verifies it on insert. */
  create(data: DeepPartial<T>): T {
    return this.repository.create({ ...data, [this.tenantColumn]: this.tenantId } as DeepPartial<T>);
  }

  async save(entity: T | T[]): Promise<T | T[]> {
    return Array.isArray(entity)
      ? this.repository.save(entity)
      : this.repository.save(entity as DeepPartial<T>) as Promise<T>;
  }

  async insert(data: DeepPartial<T>): Promise<T> {
    return (await this.repository.save(this.create(data) as DeepPartial<T>)) as T;
  }

  /**
   * Tenant-scoped update. Returns the number of affected rows so a caller can
   * distinguish "updated" from "no such row in my tenant" without a second query.
   */
  async update(where: FindOptionsWhere<T>, patch: Partial<T>): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set(patch as never)
      .where({ ...where, [this.tenantColumn]: this.tenantId })
      .execute();
    return result.affected ?? 0;
  }

  async softDeleteByPublicId(publicId: string): Promise<void> {
    const entity = await this.findByPublicIdOrFail(publicId);
    await this.repository.softRemove(entity);
  }

  async hardDelete(where: FindOptionsWhere<T>): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where({ ...where, [this.tenantColumn]: this.tenantId })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Runs `work` inside a transaction, handing it a repository bound to the
   * transactional manager.
   *
   * Taking a factory rather than exposing the manager keeps the tenant scoping
   * intact inside the transaction — the most common place it gets dropped, because
   * `manager.save()` is right there and looks harmless.
   */
  async transaction<R>(work: (repo: this) => Promise<R>): Promise<R> {
    return this.manager.transaction(async (txManager) => work(this.withManager(txManager)));
  }

  /**
   * Binds a copy of this repository to an externally-managed transaction.
   *
   * For the case `.transaction()` doesn't cover: a service that already owns a
   * `dataSource.transaction(...)` block and composes several repositories inside
   * it, rather than delegating the whole unit of work to one repository's own
   * `.transaction()`.
   */
  withManager(manager: EntityManager): this {
    const scoped = Object.create(this) as this;
    Object.defineProperty(scoped, 'manager', { value: manager });
    Object.defineProperty(scoped, 'repository', { value: manager.getRepository(this.target) });
    return scoped;
  }
}
