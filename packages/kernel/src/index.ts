// @ems/kernel — framework-free domain primitives.
//
// Nothing in this package may import NestJS, TypeORM, Next.js, or any I/O
// library. It is the one dependency the `domain/` layer of every module is
// allowed to reach for (enforced by the ESLint boundary rule in docs/03 §2.2).

export * from './money/currency.js';
export * from './money/money.js';
export * from './result/result.js';
export * from './identity/public-id.js';
export * from './errors/domain.error.js';
export * from './guards/assert.js';
export * from './types/branded.js';
export * from './text/slug.js';
