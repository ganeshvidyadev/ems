import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { FunnelQuery, FunnelResponse, StorefrontEventType } from '@ems/contracts';

/** Canonical funnel order — a shopper is expected to move left to right, never counted as skipping backward. */
const FUNNEL_STEPS: readonly StorefrontEventType[] = ['PAGE_VIEW', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_STEP', 'PURCHASE'];

/**
 * Reads `storefront_events`/`search_queries` — the two Mongo collections
 * `StorefrontEventController` writes to — via the native aggregation
 * pipeline, the same "Mongo is a read replica for behavioral data, never a
 * source of truth" split every other Mongo-backed feature in this codebase
 * follows (docs/02 §20).
 */
@Injectable()
export class FunnelAnalyticsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async getFunnel(query: FunnelQuery): Promise<FunnelResponse> {
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const to = new Date(`${query.to}T23:59:59.999Z`);

    const rows = (await this.connection
      .collection('storefront_events')
      .aggregate([
        { $match: { storeId: query.storeId, createdAt: { $gte: from, $lte: to }, type: { $in: FUNNEL_STEPS } } },
        { $group: { _id: { type: '$type', sessionId: '$sessionId' } } },
        { $group: { _id: '$_id.type', sessions: { $sum: 1 } } },
      ])
      .toArray()) as { _id: StorefrontEventType; sessions: number }[];

    const sessionsByStep = new Map(rows.map((r) => [r._id, r.sessions]));

    let previousSessions: number | null = null;
    const steps = FUNNEL_STEPS.map((type) => {
      const sessions = sessionsByStep.get(type) ?? 0;
      const dropOffPercent =
        previousSessions === null || previousSessions === 0
          ? null
          : Math.round((1 - sessions / previousSessions) * 1000) / 10;
      previousSessions = sessions;
      return { type, sessions, dropOffPercent };
    });

    return { from: query.from, to: query.to, steps };
  }

  async getTopSearchQueries(storeId: string, from: string, to: string, limit = 20) {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const rows = (await this.connection
      .collection('search_queries')
      .aggregate([
        { $match: { storeId, createdAt: { $gte: fromDate, $lte: toDate } } },
        { $group: { _id: '$query', count: { $sum: 1 }, avgResultCount: { $avg: '$resultCount' } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ])
      .toArray()) as { _id: string; count: number; avgResultCount: number | null }[];

    return rows.map((r) => ({ query: r._id, count: r.count, avgResultCount: Math.round(r.avgResultCount ?? 0) }));
  }
}
