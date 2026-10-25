import {
  addDays,
  addMonths,
  isEligible,
  lastDayOfMonth,
  upcomingEligibleDaysThroughMonth,
} from "@/lib/date";

/** How many days ahead the default responding window scans for eligible days. */
export const WINDOW_DAYS = 90;

/** Minimum number of upcoming eligible days the default window shows. */
export const MIN_DAYS = 16;

/**
 * Months a user may choose to list in "Mi disponibilidad", the current month
 * included. The smallest one matches the default window, so a choice can only
 * widen what the list shows.
 */
export const AVAILABILITY_HORIZON_OPTIONS = [2, 3, 4, 6, 12] as const;

export type AvailabilityHorizon = (typeof AVAILABILITY_HORIZON_OPTIONS)[number];

/** Horizon of a user who never picked one (`User.availabilityHorizonMonths` default). */
export const DEFAULT_AVAILABILITY_HORIZON: AvailabilityHorizon = 2;

/**
 * Narrows an arbitrary value (e.g. a client payload or a stored column) to a
 * supported availability horizon.
 *
 * @param {unknown} value - Value to check against the supported horizons.
 * @returns {boolean} True when the value is one of the supported horizons.
 */
export function isAvailabilityHorizon(value: unknown): value is AvailabilityHorizon {
  return (
    typeof value === "number" &&
    AVAILABILITY_HORIZON_OPTIONS.includes(value as AvailabilityHorizon)
  );
}

/**
 * Builds the eligible days "Mi disponibilidad" lists for a user's horizon. The
 * default window — at least MIN_DAYS eligible days within WINDOW_DAYS, through
 * the end of the last day's month — is always the floor; the horizon then adds
 * every eligible day up to the last day of the month `horizonMonths - 1` months
 * after the start's. When the default window already reaches further (late in
 * a month it can spill into a third month), it is kept whole, so a horizon never
 * shows less than the default.
 *
 * @param {string} startIso - First day of the list, "YYYY-MM-DD" (inclusive).
 * @param {number} horizonMonths - Months to cover, the start's month included.
 * @param {Set<string>} holidays - Set of holiday dates as "YYYY-MM-DD" strings.
 * @returns {string[]} The eligible days to list, ascending.
 */
export function availabilityDays(
  startIso: string,
  horizonMonths: number,
  holidays: Set<string>,
): string[] {
  const days = upcomingEligibleDaysThroughMonth(
    startIso,
    WINDOW_DAYS,
    MIN_DAYS,
    holidays,
  );
  const horizonEnd = lastDayOfMonth(addMonths(startIso.slice(0, 7), horizonMonths - 1));

  for (
    let iso = days.length > 0 ? addDays(days[days.length - 1], 1) : startIso;
    iso <= horizonEnd;
    iso = addDays(iso, 1)
  ) {
    if (isEligible(iso, holidays)) {
      days.push(iso);
    }
  }
  return days;
}
