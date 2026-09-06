import {
  VERIFICATION_WINDOW_MS,
  isVerificationWindowExpired,
  nextBackoffDelayMs,
} from '../../src/modules/domain/backoff.util';

describe('nextBackoffDelayMs', () => {
  it('starts at the 1-minute base delay on the first attempt', () => {
    expect(nextBackoffDelayMs(0)).toBe(60_000);
  });

  it('doubles with each attempt', () => {
    expect(nextBackoffDelayMs(1)).toBe(120_000);
    expect(nextBackoffDelayMs(2)).toBe(240_000);
    expect(nextBackoffDelayMs(3)).toBe(480_000);
  });

  it('caps at 6 hours so the last retries before the window closes stay frequent', () => {
    const sixHoursMs = 6 * 60 * 60 * 1000;
    expect(nextBackoffDelayMs(10)).toBe(sixHoursMs);
    expect(nextBackoffDelayMs(30)).toBe(sixHoursMs);
  });

  it('is monotonically non-decreasing', () => {
    let previous = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const delay = nextBackoffDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });
});

describe('isVerificationWindowExpired', () => {
  it('is 72 hours', () => {
    expect(VERIFICATION_WINDOW_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('is false just before the 72h window closes', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const justBefore = new Date(createdAt.getTime() + VERIFICATION_WINDOW_MS - 1_000);
    expect(isVerificationWindowExpired(createdAt, justBefore)).toBe(false);
  });

  it('is true just after the 72h window closes', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const justAfter = new Date(createdAt.getTime() + VERIFICATION_WINDOW_MS + 1_000);
    expect(isVerificationWindowExpired(createdAt, justAfter)).toBe(true);
  });

  it('anchors to domain creation, not the most recent check', () => {
    // A domain added 71 hours ago is still inside its window even if its most
    // recent check was seconds ago — the window is fixed at creation time.
    const createdAt = new Date(Date.now() - 71 * 60 * 60 * 1000);
    expect(isVerificationWindowExpired(createdAt, new Date())).toBe(false);
  });
});
