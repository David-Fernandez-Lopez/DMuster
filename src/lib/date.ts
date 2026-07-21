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

/** Matches a strict "YYYY-MM" month with a month component in 01–12. */
const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Reports whether a string is a well-formed "YYYY-MM" month (month 01–12).
 * Used to validate the calendar's `?month=` search param before rendering.
 *
 * @param {string} month - Candidate month, "YYYY-MM".
 * @returns {boolean} True when `month` is a valid year-month.
 */
export function isValidIsoMonth(month: string): boolean {
  return ISO_MONTH_PATTERN.test(month);
}

/**
 * Shifts a "YYYY-MM" month by a whole number of months, forward or backward,
 * carrying across year boundaries. Example: `addMonths("2026-01", -1)` →
 * "2025-12". Pure integer math on the year/month components.
 *
 * @param {string} month - A valid "YYYY-MM" month.
 * @param {number} delta - Number of months to add (may be negative).
 * @returns {string} The resulting month, "YYYY-MM" (zero-padded).
 */
export function addMonths(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1; // 0-based
  const total = year * 12 + monthIndex + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1; // back to 1-based
  return `${String(newYear).padStart(4, "0")}-${String(newMonth).padStart(2, "0")}`;
}

/**
 * Builds the Monday-first calendar grid for a "YYYY-MM" month: every day, as a
 * "YYYY-MM-DD" string, from the Monday on or before the 1st through the Sunday
 * on or after the last day of the month. The result is a whole number of weeks
 * (28, 35 or 42 days) so it tiles a 7-column grid exactly. All math is done in
 * UTC to stay timezone-stable, matching the rest of this module.
 *
 * @param {string} month - A valid "YYYY-MM" month.
 * @returns {string[]} Ordered calendar days covering the month's grid.
 */
export function monthGridDays(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1; // 0-based

  // Monday on or before the 1st: getUTCDay() is 0 (Sun)..6 (Sat); (day + 6) % 7
  // maps Monday→0, so subtracting it lands on the grid's first Monday.
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, monthIndex, 1 - startOffset));

  // Sunday on or after the last day: last day of the month is day 0 of the next.
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const endOffset = (7 - last.getUTCDay()) % 7; // days to reach the next Sunday
  const end = new Date(Date.UTC(year, monthIndex + 1, endOffset));

  const days: string[] = [];
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    days.push(toIsoDate(cursor));
  }
  return days;
}

/**
 * Shifts a "YYYY-MM-DD" calendar date by a whole number of days, forward or
 * backward, carrying across month and year boundaries. All math is done in UTC
 * to stay timezone-stable, matching the rest of this module.
 *
 * @param {string} iso - A valid "YYYY-MM-DD" calendar date.
 * @param {number} delta - Number of days to add (may be negative).
 * @returns {string} The resulting calendar day, "YYYY-MM-DD".
 */
export function addDays(iso: string, delta: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + delta);
  return toIsoDate(date);
}

/**
 * Collects the eligible (playable) calendar days within a forward window: it
 * scans `windowDays` consecutive days starting at `startIso` (inclusive) and
 * keeps those that are eligible — a weekend or a listed holiday (see
 * `isEligible`) — stopping once `max` have been found. Used by the "Mi
 * disponibilidad" screen to build its upcoming-days list (roadmap #16).
 *
 * @param {string} startIso - First day of the window, "YYYY-MM-DD" (inclusive).
 * @param {number} windowDays - How many consecutive days to scan from the start.
 * @param {number} max - Maximum number of eligible days to return.
 * @param {Set<string>} holidays - Set of holiday dates as "YYYY-MM-DD" strings.
 * @returns {string[]} Up to `max` eligible days, ascending.
 */
export function upcomingEligibleDays(
  startIso: string,
  windowDays: number,
  max: number,
  holidays: Set<string>,
): string[] {
  const days: string[] = [];
  for (let offset = 0; offset < windowDays && days.length < max; offset += 1) {
    const iso = addDays(startIso, offset);
    if (isEligible(iso, holidays)) {
      days.push(iso);
    }
  }
  return days;
}
