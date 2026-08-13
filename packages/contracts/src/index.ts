// @ems/contracts — the single source of truth for request/response shapes.
//
// The API validates with these schemas AND generates its Swagger document from
// them; the frontends infer their TypeScript types from the same objects. That
// is what makes a field rename a compile error in the console rather than a
// runtime 422 discovered by a merchant.

export * from './common/error-codes.js';
export * from './common/envelope.js';
export * from './common/primitives.js';
export * from './common/pagination.js';
export * from './auth/auth.contracts.js';
export * from './user/user.contracts.js';
export * from './tenant/tenant.contracts.js';
