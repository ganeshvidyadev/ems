import { Injectable } from '@nestjs/common';
import { newPublicId } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import { OutboxEventEntity } from '../../database/entities/outbox-event.entity';
import { RequestContextService } from './request-context.service';

export interface EmitEventInput {
  aggregateType: string;
  aggregateId: string | number;
  eventType: string;
  payload: Record<string, unknown>;
  eventVersion?: number;
  /** Delays first dispatch — used for scheduled follow-ups, not for retries. */
  availableAt?: Date;
  tenantId?: string | null;
}

/**
 * Writes domain events into the outbox.
 *
 * The whole point is the `EntityManager` parameter: it is **required**, and callers
 * must pass the manager of the transaction that is changing state. That is what
 * makes the event and the state atomic — either both commit or neither does.
 *
 * Taking an optional manager and falling back to a fresh connection would defeat
 * the pattern entirely and, worse, would do so silently: everything would work in
 * testing and drop events only under the partial failures the outbox exists to
 * survive. So there is no fallback.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly context: RequestContextService) {}

  /**
   * Appends one event inside the caller's transaction.
   *
   * @param manager the transactional EntityManager — NOT a fresh one
   */
  async emit(manager: EntityManager, input: EmitEventInput): Promise<string> {
    const eventId = newPublicId();
    const ctx = this.context.get();

    const event = manager.create(OutboxEventEntity, {
      eventId,
      tenantId: input.tenantId !== undefined ? input.tenantId : (ctx?.tenantId ?? null),
      aggregateType: input.aggregateType,
      aggregateId: String(input.aggregateId),
      eventType: input.eventType,
      eventVersion: input.eventVersion ?? 1,
      payload: input.payload,
      metadata: {
        correlationId: ctx?.correlationId,
        // The event currently being handled, so a chain of consequences can be
        // reconstructed from a single shopper action.
        causationId: ctx?.causationId ?? undefined,
        actorType: ctx?.userType ?? 'SYSTEM',
        actorId: ctx?.userId ?? undefined,
        surface: ctx?.surface,
      },
      status: 'PENDING',
      availableAt: input.availableAt ?? new Date(),
    });

    await manager.save(OutboxEventEntity, event);
    return eventId;
  }

  /** Appends several events in one insert — same transaction, one round trip. */
  async emitMany(manager: EntityManager, inputs: EmitEventInput[]): Promise<string[]> {
    if (inputs.length === 0) return [];

    const ctx = this.context.get();
    // `manager.create` + `save` rather than `manager.insert`: TypeORM's
    // QueryDeepPartialEntity rejects a plain `Record<string, unknown>` for a JSON
    // column, and `save` on an array of new entities still emits one multi-row
    // insert.
    const events = inputs.map((input) => {
      const eventId = newPublicId();
      return manager.create(OutboxEventEntity, {
        eventId,
        tenantId: input.tenantId !== undefined ? input.tenantId : (ctx?.tenantId ?? null),
        aggregateType: input.aggregateType,
        aggregateId: String(input.aggregateId),
        eventType: input.eventType,
        eventVersion: input.eventVersion ?? 1,
        payload: input.payload,
        metadata: {
          correlationId: ctx?.correlationId,
          causationId: ctx?.causationId ?? undefined,
          actorType: ctx?.userType ?? 'SYSTEM',
          actorId: ctx?.userId ?? undefined,
          surface: ctx?.surface,
        },
        status: 'PENDING' as const,
        availableAt: input.availableAt ?? new Date(),
      });
    });

    await manager.save(OutboxEventEntity, events);
    return events.map((event) => event.eventId);
  }
}
