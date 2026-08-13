import { Injectable, Logger } from '@nestjs/common';
import { CrossTenantAccessError, TenantContextMissingError } from '@ems/kernel';
import {
  DataSource,
  EventSubscriber,
  type EntityMetadata,
  type EntitySubscriberInterface,
  type InsertEvent,
  type LoadEvent,
  type RemoveEvent,
  type UpdateEvent,
} from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';
import {
  getTenantScopedOptions,
  isTenantScoped,
} from '../../common/decorators/tenant-scoped.decorator';

/**
 * Isolation **layer 2** (docs/01 §4.2).
 *
 * Layer 1 (`TenantScopedRepository`) injects the tenant predicate into queries.
 * This subscriber is the safety net for anything that bypasses it — a raw
 * `EntityManager` call, a relation cascade, a `save()` on an entity loaded by a
 * hand-written query builder.
 *
 * MySQL has no row-level security, so isolation is a code invariant and a single
 * forgotten `where` clause is a cross-tenant data breach. One layer is not enough
 * to bet a multi-tenant platform on.
 *
 * It does three things:
 *   - `beforeInsert`  stamps `tenant_id` from context, or refuses the write.
 *   - `beforeUpdate` / `beforeRemove`  refuse to touch another tenant's row.
 *   - `afterLoad`     refuses to *return* another tenant's row.
 *
 * `afterLoad` is the one that catches real bugs. The others assume the code got
 * the right row and only checks intent; `afterLoad` catches the query that fetched
 * the wrong row in the first place.
 */
@Injectable()
@EventSubscriber()
export class TenantGuardSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(TenantGuardSubscriber.name);

  constructor(
    dataSource: DataSource,
    private readonly context: RequestContextService,
  ) {
    dataSource.subscribers.push(this);
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    const options = this.scopeFor(event);
    if (!options) return;

    const entity = event.entity;
    if (!entity) return;

    const column = options.column;
    const current = entity[column];
    const contextTenantId = this.context.tenantId;

    if (current === undefined || current === null) {
      if (options.allowNullTenant && this.isDeliberatelyGlobal(entity)) {
        // A genuinely global row (a system role, a platform user). The entity
        // itself declares this, so it is not an accidental omission.
        return;
      }

      if (!contextTenantId) {
        throw new TenantContextMissingError(
          `insert into ${event.metadata.tableName}`,
        );
      }

      entity[column] = contextTenantId;
      return;
    }

    // Explicitly set — allowed only if it agrees with the active context.
    // Platform/system contexts may write across tenants by design.
    if (contextTenantId && String(current) !== String(contextTenantId)) {
      throw new CrossTenantAccessError(event.metadata.name, contextTenantId, current);
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    this.assertOwnership(event.metadata.name, event.entity ?? event.databaseEntity, event, 'update');
  }

  beforeRemove(event: RemoveEvent<Record<string, unknown>>): void {
    this.assertOwnership(event.metadata.name, event.databaseEntity ?? event.entity, event, 'remove');
  }

  beforeSoftRemove(event: RemoveEvent<Record<string, unknown>>): void {
    this.assertOwnership(
      event.metadata.name,
      event.databaseEntity ?? event.entity,
      event,
      'soft-remove',
    );
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  afterLoad(entity: unknown, event?: LoadEvent<Record<string, unknown>>): void {
    if (!event || !entity || typeof entity !== 'object') return;

    const target = classTargetOf(event.metadata);
    if (!target || !isTenantScoped(target)) return;

    const options = getTenantScopedOptions(target);
    if (!options) return;

    const row = entity as Record<string, unknown>;

    const rowTenantId = row[options.column];
    const contextTenantId = this.context.tenantId;

    // No tenant in context means platform/system work, which is legitimately
    // cross-tenant (the outbox relay, platform reporting, migrations).
    if (!contextTenantId) return;

    if (rowTenantId === null || rowTenantId === undefined) {
      // A shared global row is visible to every tenant by design.
      if (options.allowNullTenant) return;
      return;
    }

    if (String(rowTenantId) !== String(contextTenantId)) {
      this.logger.error(
        `Tenant isolation breach caught on read: ${event.metadata.name} ` +
          `row belongs to tenant ${String(rowTenantId)} but context is ${contextTenantId}. ` +
          `A query is missing its tenant predicate.`,
      );
      throw new CrossTenantAccessError(event.metadata.name, contextTenantId, rowTenantId);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private scopeFor(event: { metadata: EntityMetadata }) {
    const target = classTargetOf(event.metadata);
    if (!target || !isTenantScoped(target)) return undefined;
    return getTenantScopedOptions(target);
  }

  private assertOwnership(
    entityName: string,
    entity: Record<string, unknown> | undefined | null,
    event: { metadata: EntityMetadata },
    operation: string,
  ): void {
    const options = this.scopeFor(event);
    if (!options || !entity) return;

    const rowTenantId = entity[options.column];
    const contextTenantId = this.context.tenantId;

    if (!contextTenantId) return;
    if (rowTenantId === null || rowTenantId === undefined) return;

    if (String(rowTenantId) !== String(contextTenantId)) {
      this.logger.error(
        `Blocked cross-tenant ${operation} on ${entityName}: ` +
          `row tenant ${String(rowTenantId)}, context tenant ${contextTenantId}`,
      );
      throw new CrossTenantAccessError(entityName, contextTenantId, rowTenantId);
    }
  }

  /**
   * True when the entity is asserting that it is a platform-global row rather
   * than having simply forgotten its tenant.
   *
   * The distinction is what stops `allowNullTenant` from becoming a hole: a
   * system role says `is_system = true`, a platform user says
   * `user_type = 'PLATFORM'`. Anything else with a NULL tenant is a bug.
   */
  private isDeliberatelyGlobal(entity: Record<string, unknown>): boolean {
    if (entity['userType'] === 'PLATFORM') return true;
    if (entity['isSystem'] === true) return true;
    if (entity['scope'] === 'PLATFORM') return true;
    return false;
  }
}

/**
 * TypeORM's `EntityMetadata.target` is `Function | string` — a string when the
 * entity was declared as a schema rather than a decorated class. Only the class
 * form can carry `@TenantScoped()` metadata, so anything else is skipped.
 */
function classTargetOf(metadata: EntityMetadata): Function | undefined {
  return typeof metadata.target === 'function' ? metadata.target : undefined;
}
