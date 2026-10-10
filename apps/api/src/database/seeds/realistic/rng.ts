import { createHash } from 'node:crypto';

/**
 * Deterministic randomness for the realistic seeder.
 *
 * Nothing in the seeder may call `Math.random()` or read the wall clock for a data
 * value: every random decision comes from a PRNG keyed by
 * `(globalSeed, tenantSlug, entityKind, index)`, so two runs with the same inputs
 * produce byte-identical datasets, on any day, on any machine.
 */

/** 32-bit FNV-1a, then avalanche-mixed. Used only to turn a string key into a PRNG seed. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on an empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks by weight; entries with weight <= 0 are never chosen. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) throw new Error('Rng.weighted needs a positive total weight');
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      const weight = Math.max(0, w);
      if (roll < weight) return value;
      roll -= weight;
    }
    return entries[entries.length - 1]![0];
  }

  /** Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }

  /** Roughly normal(0,1) via Box-Muller; clamped to +-3. */
  gauss(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-3, Math.min(3, z));
  }
}

/** A PRNG for one (tenant, entity kind, index) coordinate. */
export function rngFor(globalSeed: number, tenantSlug: string, kind: string, index: number | string = 0): Rng {
  return new Rng(hash32(`${globalSeed}|${tenantSlug}|${kind}|${index}`));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A deterministic, ULID-shaped public id.
 *
 * The first 10 characters encode the row's creation time exactly like a real ULID (so the
 * `public_id` index still clusters chronologically and `publicIdCreatedAt()` works); the last
 * 16 are derived from a SHA-256 of the natural key instead of from entropy. Same natural key
 * and timestamp, same id, on every run and every machine.
 */
export function deterministicPublicId(at: Date, key: string): string {
  let time = BigInt(Math.max(0, at.getTime()));
  let timePart = '';
  for (let i = 0; i < 10; i += 1) {
    timePart = CROCKFORD[Number(time % 32n)]! + timePart;
    time /= 32n;
  }
  const digest = createHash('sha256').update(key).digest();
  let bits = 0n;
  for (let i = 0; i < 10; i += 1) bits = (bits << 8n) | BigInt(digest[i]!);
  let randomPart = '';
  for (let i = 0; i < 16; i += 1) {
    randomPart = CROCKFORD[Number(bits % 32n)]! + randomPart;
    bits /= 32n;
  }
  return timePart + randomPart;
}

/** Stable lowercase hex string of `length` characters derived from `key`. */
export function hexFrom(key: string, length: number): string {
  return sha256Hex(key).slice(0, length);
}
