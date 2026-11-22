import type { TFunction } from "i18next";

import { toUtcDate } from "@/lib/date";

/** Names listed in full before collapsing into "A, B and N more". */
const MAX_LISTED_NAMES = 3;

/**
 * Formats a month key as "julio 2026" / "July 2026".
 *
 * @param {string} month - "YYYY-MM".
 * @param {string} locale - BCP 47 locale.
 * @returns {string} The long month name with the year.
 */
export function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(`${month}-01`));
}

/**
 * Three-letter month abbreviation, lowercase and without a trailing dot.
 *
 * @param {string} month - "YYYY-MM".
 * @param {string} locale - BCP 47 locale.
 * @returns {string} E.g. "jul".
 */
export function monthShort(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
    .format(toUtcDate(`${month}-01`))
    .replace(".", "")
    .slice(0, 3)
    .toLowerCase();
}

/**
 * Single-letter month initial, uppercase.
 *
 * @param {string} month - "YYYY-MM".
 * @param {string} locale - BCP 47 locale.
 * @returns {string} E.g. "J".
 */
export function monthInitial(month: string, locale: string): string {
  return monthShort(month, locale)[0].toUpperCase();
}

/**
 * Short day such as "sáb 8 ago".
 *
 * @param {string} date - "YYYY-MM-DD".
 * @param {string} locale - BCP 47 locale.
 * @returns {string} Weekday, day and month, abbreviated.
 */
export function shortDay(date: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(toUtcDate(date));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((part) => part.type === type)?.value ?? "").replace(".", "");
  return `${pick("weekday")} ${pick("day")} ${pick("month")}`;
}

/**
 * Day and month only, such as "18 may".
 *
 * @param {string} date - "YYYY-MM-DD".
 * @param {string} locale - BCP 47 locale.
 * @returns {string} Abbreviated day and month.
 */
function dayMonth(date: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(toUtcDate(date));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((part) => part.type === type)?.value ?? "").replace(".", "");
  return locale.startsWith("en")
    ? `${pick("month")} ${pick("day")}`
    : `${pick("day")} ${pick("month")}`;
}

/**
 * A date range such as "18 may – 13 sep".
 *
 * @param {string} from - "YYYY-MM-DD".
 * @param {string} to - "YYYY-MM-DD".
 * @param {string} locale - BCP 47 locale.
 * @returns {string} The range.
 */
export function shortRange(from: string, to: string, locale: string): string {
  return `${dayMonth(from, locale)} – ${dayMonth(to, locale)}`;
}

/**
 * "3 h 39 min" / "4 h" from minutes.
 *
 * @param {number} minutes - Duration in minutes.
 * @returns {string} Hours and minutes.
 */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * A decimal with the locale's separator and at most one fraction digit.
 *
 * @param {number} value - The number.
 * @param {string} locale - BCP 47 locale.
 * @returns {string} E.g. "6,7".
 */
export function decimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/**
 * Joins names: up to three as "A, B y C"; more collapse into "A, B y N más".
 *
 * @param {string[]} names - The names.
 * @param {TFunction} t - Translation function.
 * @param {string} locale - BCP 47 locale.
 * @returns {string} The joined text.
 */
export function joinNames(names: string[], t: TFunction, locale: string): string {
  if (names.length <= MAX_LISTED_NAMES) {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
  }
  return t("statistics.joinMore", {
    names: names.slice(0, 2).join(", "),
    count: names.length - 2,
  });
}

/**
 * Ordinal position: "2.º" in Spanish, "2nd" in English.
 *
 * @param {number} position - 1-based position.
 * @param {string} locale - BCP 47 locale.
 * @returns {string} The ordinal.
 */
export function ordinal(position: number, locale: string): string {
  if (!locale.startsWith("en")) {
    return `${position}.º`;
  }
  const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(position);
  const suffixes: Partial<Record<Intl.LDMLPluralRule, string>> = {
    one: "st",
    two: "nd",
    few: "rd",
  };
  const suffix = suffixes[rule] ?? "th";
  return `${position}${suffix}`;
}
