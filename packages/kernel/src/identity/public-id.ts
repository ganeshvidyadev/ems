import { monotonicFactory, decodeTime, ulid as randomUlid } from 'ulid';

/**
 * Monotonic ULID factory.
 *
 * ULID over UUIDv4 for public identifiers because it is lexicographically
 * sortable by creation time. That means a B-tree index on `public_id` clusters
 * chronologically instead of scattering writes across the index, and
 * "most recent first" needs no separate timestamp sort.
 *
 * The monotonic variant guarantees strictly increasing values within the same
 * millisecond, so two rows created in the same tick still order deterministically.
 */
const monotonic = monotonicFactory();

/** 26-character Crockford-base32 identifier. Matches `CHAR(26)` in MySQL. */
export type PublicId = string;

export function newPublicId(): PublicId {
  return monotonic();
}

/** Non-monotonic variant — for cases where sequence-guessing must be harder. */
export function newRandomPublicId(): PublicId {
  return randomUlid();
}

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isPublicId(value: unknown): value is PublicId {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

/** Creation timestamp encoded in the ULID's first 10 characters. */
export function publicIdCreatedAt(id: PublicId): Date {
  if (!isPublicId(id)) throw new Error(`Not a valid ULID: "${id}"`);
  return new Date(decodeTime(id));
}

/**
 * Prefixed identifier for human-facing surfaces (logs, support tickets, URLs),
 * e.g. `ord_01J8XK...`. The prefix makes a pasted ID self-describing, which
 * measurably shortens support triage.
 */
export function prefixedId(prefix: string, id: PublicId = newPublicId()): string {
  return `${prefix}_${id}`;
}

export function stripPrefix(prefixed: string): PublicId {
  const index = prefixed.indexOf('_');
  return index === -1 ? prefixed : prefixed.slice(index + 1);
}
