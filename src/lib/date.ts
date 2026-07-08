// Shared, framework-free date helpers for the calendar domain. All calendar
// days are handled as "YYYY-MM-DD" strings and compared as strings; any Date
// built from them is pinned to UTC midnight so the stored/rendered day never
// shifts with the host timezone (ported from prisma/seed.ts `toUtcDate` /
// `isEligibleDate`). This module imports nothing from Prisma or Next so it
// stays trivially unit-testable (see roadmap #17).

/** Matches a strict "YYYY-MM-DD" calendar date. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a "YYYY-MM-DD" string into a Date pinned to UTC midnight, so values
 * stored in `@db.Date` columns land on the intended calendar day regardless of
 * the host timezone. The local `Date` constructor would shift the day (e.g. in
 * Madrid summer time it would store the previous day).
 *
 * @param {string} iso - ISO calendar date, "YYYY-MM-DD".
 * @returns {Date} The date at 00:00:00 UTC (possibly `Invalid Date` if `iso`
 *   is out of range — call `isValidIsoDate` first when the input is untrusted).
 */
export function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Formats a Date as its "YYYY-MM-DD" calendar day using its UTC components,
 * the inverse of `toUtcDate`. Prisma returns `@db.Date` values at UTC midnight,
 * so this yields the intended calendar day.
 *
 * @param {Date} date - A valid Date (UTC components are read).
 * @returns {string} The calendar day, "YYYY-MM-DD".
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Reports whether a string is a real "YYYY-MM-DD" calendar date. Guards against
 * both malformed strings and impossible days (e.g. "2026-02-30"): the format is
 * checked, then the parsed Date is verified to be valid and to round-trip back
 * to the same string (which rejects month/day rollovers).
 *
 * @param {string} iso - Candidate calendar date.
 * @returns {boolean} True when `iso` denotes a real calendar day.
 */
export function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE_PATTERN.test(iso)) {
    return false;
  }
  const date = toUtcDate(iso);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === iso;
}

/**
 * Reports whether a calendar date falls on a Saturday or Sunday. Weekends are
 * always eligible for play and are never stored as holidays.
 *
 * @param {string} iso - A valid "YYYY-MM-DD" calendar date.
 * @returns {boolean} True when the date is a Saturday or Sunday.
 */
export function isWeekend(iso: string): boolean {
  const day = toUtcDate(iso).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

/**
 * Reports whether a calendar date is eligible (playable/respondable): a weekend,
 * or an extra weekday listed in the holiday set. Mirrors the seed's eligibility
 * rule and the business logic in CLAUDE.md §3.
 *
 * @param {string} iso - A valid "YYYY-MM-DD" calendar date.
 * @param {Set<string>} holidays - Set of holiday dates as "YYYY-MM-DD" strings.
 * @returns {boolean} True when the date is eligible for play.
 */
export function isEligible(iso: string, holidays: Set<string>): boolean {
  return isWeekend(iso) || holidays.has(iso);
}

/**
 * Returns today's calendar day as "YYYY-MM-DD" in UTC, consistent with how all
 * calendar dates are stored and compared across the app.
 *
 * @returns {string} Today's date, "YYYY-MM-DD" (UTC).
 */
export function todayIso(): string {
  return toIsoDate(new Date());
}
