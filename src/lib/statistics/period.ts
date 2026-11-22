import { addMonths } from "@/lib/date";

/**
 * The period every statistics tab shares: the whole history, the last twelve
 * months (current month included) or one calendar year such as `"2026"`.
 */
export type Period = "all" | "last12" | `${number}`;

/** Resolved extent of a period, in ISO days and `YYYY-MM` months. */
export type PeriodBounds = {
  /** First day counted (inclusive). */
  from: string;
  /** Last day counted (inclusive, never later than today). */
  to: string;
  /** First month of the monthly axis. */
  firstMonth: string;
  /** Last month of the monthly axis. */
  lastMonth: string;
};

/** Matches a four-digit year. */
const YEAR_PATTERN = /^\d{4}$/;

/**
 * Parses the `?period=` search param. Anything unrecognised falls back to
 * `"all"`, so a stale or hand-edited URL never breaks the page.
 *
 * @param {string | string[] | undefined} raw - The raw search param.
 * @returns {Period} A valid period.
 */
export function parsePeriod(raw: string | string[] | undefined): Period {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "last12") {
    return "last12";
  }
  if (value !== undefined && YEAR_PATTERN.test(value)) {
    return value as Period;
  }
  return "all";
}

/**
 * Resolves a period into concrete bounds. "Todo" runs from the first month
 * with data to the current month; "last12" from the current month minus 11;
 * a year covers January to December of that year (days after today are never
 * counted, so the current year simply stops at today).
 *
 * @param {Period} period - The selected period.
 * @param {string} today - Today as "YYYY-MM-DD".
 * @param {string | null} firstDataDate - Earliest date with data, if any.
 * @returns {PeriodBounds} The resolved bounds.
 */
export function periodBounds(
  period: Period,
  today: string,
  firstDataDate: string | null,
): PeriodBounds {
  const currentMonth = today.slice(0, 7);

  if (period === "last12") {
    const firstMonth = addMonths(currentMonth, -11);
    return { from: `${firstMonth}-01`, to: today, firstMonth, lastMonth: currentMonth };
  }

  if (period === "all") {
    const firstMonth = (firstDataDate ?? today).slice(0, 7);
    return { from: `${firstMonth}-01`, to: today, firstMonth, lastMonth: currentMonth };
  }

  const yearEnd = `${period}-12-31`;
  return {
    from: `${period}-01-01`,
    to: yearEnd < today ? yearEnd : today,
    firstMonth: `${period}-01`,
    lastMonth: `${period}-12`,
  };
}

/**
 * Lists the months of a period's axis, oldest first.
 *
 * @param {PeriodBounds} bounds - The resolved period.
 * @returns {string[]} `YYYY-MM` keys from `firstMonth` to `lastMonth`.
 */
export function monthKeys(bounds: PeriodBounds): string[] {
  const keys: string[] = [];
  for (let month = bounds.firstMonth; month <= bounds.lastMonth; month = addMonths(month, 1)) {
    keys.push(month);
  }
  return keys;
}

/**
 * Whether an ISO day falls inside the period.
 *
 * @param {string} date - "YYYY-MM-DD".
 * @param {PeriodBounds} bounds - The resolved period.
 * @returns {boolean} True when `from <= date <= to`.
 */
export function inPeriod(date: string, bounds: PeriodBounds): boolean {
  return date >= bounds.from && date <= bounds.to;
}

/**
 * The options of the period selector: "all", "last12", then one entry per
 * year with data, most recent first.
 *
 * @param {number[]} years - Years that have data, in any order.
 * @returns {Period[]} The selectable periods.
 */
export function availablePeriods(years: number[]): Period[] {
  const unique = [...new Set(years)].sort((a, b) => b - a);
  return ["all", "last12", ...unique.map((year) => String(year) as Period)];
}
