/* eslint-disable */
// Runs once on first container start (empty data dir).
//
// Creates the log/analytics databases, an application user, and the TTL +
// query indexes from docs/02-data-model.md §20.
//
// TTL indexes rather than capped collections: "keep 30 days" is a per-document
// age guarantee, and a capped collection evicts by total size — so a traffic
// spike would silently destroy the retention window.

const appUser = 'ems_app';
const appPassword = 'ems_app_password';

// ---------------------------------------------------------------------------
// ems_logs
// ---------------------------------------------------------------------------
const logsDb = db.getSiblingDB('ems_logs');

const DAY = 86400;

const collections = {
  api_logs: {
    ttlSeconds: 30 * DAY,
    indexes: [
      [{ correlationId: 1 }, {}],
      [{ tenantId: 1, createdAt: -1 }, {}],
      [{ 'response.statusCode': 1, createdAt: -1 }, {}],
      [{ 'request.route': 1, createdAt: -1 }, {}],
      // Slow-endpoint hunting: sort by duration within a time window.
      [{ 'timing.durationMs': -1, createdAt: -1 }, {}],
      [{ userId: 1, createdAt: -1 }, {}],
    ],
  },
  error_logs: {
    ttlSeconds: 90 * DAY,
    indexes: [
      [{ correlationId: 1 }, {}],
      // fingerprint groups N occurrences of one bug into a single admin-UI row.
      [{ fingerprint: 1, createdAt: -1 }, {}],
      [{ tenantId: 1, createdAt: -1 }, {}],
      [{ level: 1, createdAt: -1 }, {}],
    ],
  },
  auth_logs: {
    // 365 days: breach investigations look back months.
    ttlSeconds: 365 * DAY,
    indexes: [
      [{ identifier: 1, createdAt: -1 }, {}],
      [{ event: 1, createdAt: -1 }, {}],
      [{ ip: 1, createdAt: -1 }, {}],
      [{ tenantId: 1, createdAt: -1 }, {}],
    ],
  },
  activity_logs: {
    ttlSeconds: 180 * DAY,
    indexes: [
      [{ tenantId: 1, createdAt: -1 }, {}],
      [{ 'entity.type': 1, 'entity.id': 1, createdAt: -1 }, {}],
      [{ 'actor.id': 1, createdAt: -1 }, {}],
    ],
  },
  webhook_logs: {
    ttlSeconds: 30 * DAY,
    indexes: [
      [{ provider: 1, createdAt: -1 }, {}],
      [{ direction: 1, createdAt: -1 }, {}],
      [{ tenantId: 1, createdAt: -1 }, {}],
      [{ correlationId: 1 }, {}],
    ],
  },
  job_logs: {
    ttlSeconds: 30 * DAY,
    indexes: [
      [{ queue: 1, createdAt: -1 }, {}],
      [{ jobId: 1 }, {}],
      [{ status: 1, createdAt: -1 }, {}],
    ],
  },
  third_party_logs: {
    ttlSeconds: 30 * DAY,
    indexes: [
      [{ provider: 1, operation: 1, createdAt: -1 }, {}],
      [{ statusCode: 1, createdAt: -1 }, {}],
      [{ correlationId: 1 }, {}],
    ],
  },
};

for (const [name, spec] of Object.entries(collections)) {
  logsDb.createCollection(name);
  logsDb[name].createIndex({ createdAt: 1 }, { expireAfterSeconds: spec.ttlSeconds });
  for (const [keys, opts] of spec.indexes) {
    logsDb[name].createIndex(keys, opts);
  }
  print(`[ems_logs] ${name}: TTL ${spec.ttlSeconds}s + ${spec.indexes.length} indexes`);
}

// ---------------------------------------------------------------------------
// ems_analytics
// ---------------------------------------------------------------------------
const analyticsDb = db.getSiblingDB('ems_analytics');

analyticsDb.createCollection('storefront_events');
analyticsDb.storefront_events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * DAY });
analyticsDb.storefront_events.createIndex({ tenantId: 1, event: 1, createdAt: -1 });
analyticsDb.storefront_events.createIndex({ sessionId: 1, createdAt: 1 });
analyticsDb.storefront_events.createIndex({ tenantId: 1, productId: 1, createdAt: -1 });

analyticsDb.createCollection('search_queries');
analyticsDb.search_queries.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * DAY });
analyticsDb.search_queries.createIndex({ tenantId: 1, createdAt: -1 });
// Zero-result reporting drives synonym tuning.
analyticsDb.search_queries.createIndex({ tenantId: 1, resultCount: 1, createdAt: -1 });

print('[ems_analytics] storefront_events + search_queries created');

// ---------------------------------------------------------------------------
// Application user — readWrite on both, no admin rights.
// ---------------------------------------------------------------------------
const admin = db.getSiblingDB('admin');
admin.createUser({
  user: appUser,
  pwd: appPassword,
  roles: [
    { role: 'readWrite', db: 'ems_logs' },
    { role: 'readWrite', db: 'ems_analytics' },
  ],
});

print(`[mongo] application user '${appUser}' created`);
