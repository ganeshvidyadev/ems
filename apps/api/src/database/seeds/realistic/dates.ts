import type { Rng } from './rng';

export const MS_MINUTE = 60_000;
export const MS_HOUR = 3_600_000;
export const MS_DAY = 86_400_000;
/** India Standard Time offset: UTC+05:30. Shoppers live in IST, rows are stored in UTC. */
export const IST_OFFSET_MS = 330 * MS_MINUTE;

export function parseDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${day}"`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + Math.round(ms));
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** Festival / sale dates (UTC calendar days). Approximate where the real date moves each year. */
const FESTIVALS: { date: string; amp: number }[] = [
  { date: '2025-01-26', amp: 0.8 }, { date: '2026-01-26', amp: 0.8 }, { date: '2027-01-26', amp: 0.8 },
  { date: '2025-03-14', amp: 0.4 }, { date: '2026-03-04', amp: 0.4 }, { date: '2027-03-22', amp: 0.4 },
  { date: '2025-08-15', amp: 0.9 }, { date: '2026-08-15', amp: 0.9 }, { date: '2027-08-15', amp: 0.9 },
  { date: '2025-08-09', amp: 0.6 }, { date: '2026-08-28', amp: 0.6 }, { date: '2027-08-17', amp: 0.6 },
  { date: '2025-08-27', amp: 0.5 }, { date: '2026-09-14', amp: 0.5 }, { date: '2027-09-04', amp: 0.5 },
  { date: '2025-10-02', amp: 0.8 }, { date: '2026-10-20', amp: 0.8 }, { date: '2027-10-09', amp: 0.8 },
  { date: '2025-10-20', amp: 1.4 }, { date: '2026-11-08', amp: 1.4 }, { date: '2027-10-29', amp: 1.4 },
  { date: '2025-12-25', amp: 0.5 }, { date: '2026-12-25', amp: 0.5 },
];

/** Big-sale windows ("Big Billion"-style) start roughly three weeks before Diwali and run ten days. */
const SALE_STARTS = ['2025-09-28', '2026-10-18', '2027-10-08'];

const FESTIVAL_PARSED = FESTIVALS.map((f) => ({ t: parseDay(f.date).getTime(), amp: f.amp }));
const SALE_PARSED = SALE_STARTS.map((d) => parseDay(d).getTime());

/**
 * Relative demand for one calendar day: a weekend lift, a build-up before each festival (rising
 * over ten days), a short tail after it, and a flat uplift inside the big-sale windows.
 */
export function dayWeight(day: Date, weekendBoost: number): number {
  const t = day.getTime();
  let weight = 1;
  const dow = new Date(t + IST_OFFSET_MS).getUTCDay();
  if (dow === 0 || dow === 6) weight *= weekendBoost;
  for (const f of FESTIVAL_PARSED) {
    const delta = (t - f.t) / MS_DAY;
    if (delta <= 0 && delta >= -10) weight += f.amp * (1 + delta / 10);
    else if (delta > 0 && delta <= 3) weight += f.amp * 0.5 * (1 - delta / 4);
  }
  for (const s of SALE_PARSED) {
    const delta = (t - s) / MS_DAY;
    if (delta >= 0 && delta < 10) weight += 0.7;
  }
  return weight;
}

/** Hour-of-day (IST) demand: a morning bump, a lunch bump and a strong evening peak. */
const HOUR_WEIGHTS = [0.6, 0.3, 0.2, 0.15, 0.2, 0.4, 0.8, 1.4, 2.2, 3.0, 3.6, 4.0, 4.2, 3.8, 3.4, 3.2, 3.4, 3.8, 4.4, 5.2, 5.6, 5.0, 3.2, 1.4];

/** A UTC instant on `day` (UTC midnight of the IST calendar day) at a plausible shopping hour. */
export function timeOnDay(dayIstMidnightUtc: Date, rng: Rng): Date {
  const hour = rng.weighted(HOUR_WEIGHTS.map((w, h) => [h, w] as const));
  const ms = hour * MS_HOUR + rng.int(0, MS_HOUR - 1);
  return new Date(dayIstMidnightUtc.getTime() + ms);
}

/** Midnight IST of the IST calendar day containing `instant`, expressed in UTC. */
export function istMidnightUtc(instant: Date): Date {
  const shifted = instant.getTime() + IST_OFFSET_MS;
  const dayStart = Math.floor(shifted / MS_DAY) * MS_DAY;
  return new Date(dayStart - IST_OFFSET_MS);
}

export function formatIst(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16) + ' IST';
}

/** base36 timestamp token used by the application for shipment and RMA numbers. */
export function base36Stamp(instant: Date): string {
  return instant.getTime().toString(36).toUpperCase();
}
