/**
 * Exponential backoff for custom-domain ownership verification (docs/01 §10:
 * "verification with exponential backoff up to 72 h").
 *
 * DNS propagation for a merchant-controlled TXT record is unpredictable —
 * some registrars propagate in seconds, others take hours — so retries start
 * cheap (1 minute) and back off aggressively, capped per-step so the last
 * few retries before the window closes are still hourly rather than one
 * multi-day wait.
 */
const BASE_DELAY_MS = 60_000; // 1 minute
const MAX_STEP_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours
export const VERIFICATION_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

/** `attempt` is the number of checks already made (0 before the first). */
export function nextBackoffDelayMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_STEP_DELAY_MS);
}

/** The 72h window is anchored to when the domain was added, not the last check. */
export function isVerificationWindowExpired(domainCreatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - domainCreatedAt.getTime() > VERIFICATION_WINDOW_MS;
}
