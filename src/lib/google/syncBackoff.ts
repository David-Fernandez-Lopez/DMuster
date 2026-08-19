// Pure retry/backoff policy for the Google Calendar sync ledger (roadmap
// #23). Takes plain values (no Prisma row, no reading the clock internally),
// so it stays trivially unit-testable, mirroring roadmap #17's precedent
// with viability.ts.

/** A row is given up on after this many failed attempts. */
export const MAX_SYNC_ATTEMPTS = 5;

/** Base delay for the exponential backoff, in milliseconds (1 minute). */
const BASE_DELAY_MS = 60 * 1000;

/**
 * Computes the exponential backoff delay before the next retry: 1, 2, 4, 8,
 * 16 minutes after attempts 1 through 5 respectively (doubling each time).
 *
 * @param {number} attempts - How many attempts have already failed.
 * @returns {number} Milliseconds to wait after the last attempt.
 */
function backoffDelayMs(attempts: number): number {
  return BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
}

/**
 * Decides whether a PENDING/FAILED sync row is due to be (re)attempted: the
 * attempt budget must not be exhausted, and — for a row that has failed
 * before — enough time must have passed since the last attempt per the
 * exponential backoff schedule.
 *
 * @param {number} attempts - How many attempts have already failed.
 * @param {Date | null} lastAttemptAt - When the last attempt ran, or null if never attempted.
 * @param {Date} now - The current time, passed in rather than read internally so callers stay deterministic in tests.
 * @returns {boolean} True when the row should be processed now.
 */
export function isDueForRetry(attempts: number, lastAttemptAt: Date | null, now: Date): boolean {
  if (attempts >= MAX_SYNC_ATTEMPTS) {
    return false;
  }
  if (!lastAttemptAt) {
    return true;
  }
  const elapsedMs = now.getTime() - lastAttemptAt.getTime();
  return elapsedMs >= backoffDelayMs(attempts);
}
