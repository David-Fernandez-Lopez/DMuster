// Pure builders for the events of the per-user calendar feed: one for each
// confirmed session the user attends, plus the monthly availability reminder.
// Adapted from the Google Calendar event builders this feed replaces. No Prisma
// and no network: the caller supplies already-resolved plain data.

import { createInstance, type TFunction } from "i18next";

import { type AppLocale, getOptions } from "@/i18n/settings";
import type { IcsAllDayEvent, IcsEvent } from "@/lib/calendarFeed/ics";
import { addDays, zonedWallTimeToUtc } from "@/lib/date";

/** Minutes in a full day, used to carry a session's end time past midnight. */
const MINUTES_PER_DAY = 24 * 60;

/** Applied when a session has a start time but no explicit duration. */
export const DEFAULT_EVENT_DURATION_MINUTES = 240;

/** Input to `buildSessionEvent`, already resolved by the caller. */
export type SessionEventInput = {
  sessionId: string;
  campaignName: string;
  /** The session's calendar day, "YYYY-MM-DD". */
  dateIso: string;
  /** "HH:MM" local wall time, or null for an all-day session. */
  startTime: string | null;
  /** Only meaningful with `startTime`; defaults to 4 hours when a start time is set but no duration was chosen. */
  durationMinutes: number | null;
  /** Display names of everyone attending, listed in the description. */
  attendeeNames: string[];
  /** The attendees who answered "Sí (Online)" for the day (a subset of `attendeeNames`). */
  onlineAttendeeNames: string[];
  /** When the session row last changed. */
  updatedAt: Date;
  /** Locale of the feed's owner. */
  locale: AppLocale;
  /** IANA timezone the stored "HH:MM" wall time is interpreted in. */
  timezone: string;
  /** Base app URL; the event links to `${appUrl}/sessions`, or omits the link when null. */
  appUrl: string | null;
};

/** Input to `buildReminderEvent`, already resolved by the caller. */
export type ReminderEventInput = {
  /** The month with unanswered eligible days, "YYYY-MM". */
  month: string;
  /** The event's day: the last day of the month BEFORE `month`, "YYYY-MM-DD". */
  dateIso: string;
  userId: string;
  /** Locale of the feed's owner. */
  locale: AppLocale;
  /** Base app URL; the event links to `${appUrl}/availability`, or omits the link when null. */
  appUrl: string | null;
  /** Instant the feed is generated, used as the event's last-modified time. */
  now: Date;
};

/**
 * Escapes the four characters that let a person's name be read as markup:
 * `< > & "`. Deliberately not i18next's own escaping, which also rewrites `'`
 * and `/`: a name like "D'Arc" is valid, and calendar apps that do not render
 * HTML (Apple, Outlook) would show it as a literal `&#39;`.
 *
 * Names are restricted at the only place they are set (`SAFE_NAME_PATTERN`), so
 * for every valid name this returns its input unchanged. It exists for the day
 * that restriction is loosened, or for a row written before it existed:
 * Google Calendar renders a subset of HTML in an event's description, and each
 * attendee's name lands in every campaign-mate's calendar.
 *
 * @param {string} text - A person-supplied string about to be interpolated.
 * @returns {string} The text with `< > & "` replaced by HTML entities.
 */
export function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Creates the translator for one feed's texts. A fresh i18next instance is
 * created per call so feeds for different locales never share state; resolution
 * is synchronous because `getOptions` bundles resources statically.
 *
 * i18next's own escaping is off: the output is plain iCalendar text, whose own
 * escaping (`escapeIcsText`) is applied by the serializer. Person-supplied
 * values are escaped by the caller with `escapeMarkup` instead.
 *
 * @param {AppLocale} locale - Locale of the feed's owner.
 * @returns {TFunction} A translator fixed to that locale.
 */
export function createFeedTranslator(locale: AppLocale): TFunction {
  const i18n = createInstance();
  i18n.init({ ...getOptions(locale), interpolation: { escapeValue: false } });
  return i18n.getFixedT(locale);
}

/**
 * Adds a number of minutes to a "HH:MM" wall-clock time anchored on a given
 * calendar day, carrying into the next day when the sum passes midnight — the
 * case a several-hour session starting late in the evening hits routinely.
 * Pure integer math, no `Date` or timezone involved.
 *
 * @param {string} dateIso - The start day, "YYYY-MM-DD".
 * @param {string} startTime - The start time, "HH:MM".
 * @param {number} minutesToAdd - Minutes to add (non-negative).
 * @returns {{ dateIso: string; time: string }} The resulting day and "HH:MM" time.
 */
export function addWallClockMinutes(
  dateIso: string,
  startTime: string,
  minutesToAdd: number,
): { dateIso: string; time: string } {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const dayOffset = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minutesOfDay = totalMinutes % MINUTES_PER_DAY;
  const endHours = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const endMinutes = String(minutesOfDay % 60).padStart(2, "0");

  return {
    dateIso: addDays(dateIso, dayOffset),
    time: `${endHours}:${endMinutes}`,
  };
}

/**
 * Builds the feed event for one confirmed session. A session with a
 * `startTime` becomes a timed event spanning `durationMinutes` (or 4 hours by
 * default), converted to UTC with the app timezone; one without becomes an
 * all-day event. When any attendee plays online the title gets an "(Online)"
 * suffix and the description names them.
 *
 * @param {SessionEventInput} input - Already-resolved session and recipient data.
 * @returns {IcsEvent} The event, with a UID stable across feed refreshes.
 */
export function buildSessionEvent(input: SessionEventInput): IcsEvent {
  const t = createFeedTranslator(input.locale);
  const isOnline = input.onlineAttendeeNames.length > 0;

  const players = input.attendeeNames.map(escapeMarkup).join(", ");
  const lines = [t("calendarFeed.eventDescription", { players })];
  if (isOnline) {
    lines.push(
      t("calendarFeed.eventDescriptionOnline", {
        players: input.onlineAttendeeNames.map(escapeMarkup).join(", "),
      }),
    );
  }

  const base = {
    uid: `session-${input.sessionId}@dmuster`,
    summary: isOnline
      ? `${input.campaignName} ${t("calendarFeed.eventOnlineSuffix")}`
      : input.campaignName,
    description: lines.join("\n"),
    url: input.appUrl ? `${input.appUrl}/sessions` : null,
    lastModified: input.updatedAt,
  };

  if (!input.startTime) {
    return { ...base, kind: "allDay", dateIso: input.dateIso };
  }

  const end = addWallClockMinutes(
    input.dateIso,
    input.startTime,
    input.durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES,
  );

  return {
    ...base,
    kind: "timed",
    start: zonedWallTimeToUtc(input.dateIso, input.startTime, input.timezone),
    end: zonedWallTimeToUtc(end.dateIso, end.time, input.timezone),
  };
}

/**
 * Decides whether a user needs the monthly availability reminder: some eligible
 * day of the month under review has no stored answer. A month with no eligible
 * days at all never needs one.
 *
 * @param {string[]} eligibleDays - The month's eligible days, "YYYY-MM-DD".
 * @param {Set<string>} answeredDays - The days the user already answered.
 * @returns {boolean} True when at least one eligible day is unanswered.
 */
export function needsAvailabilityReminder(
  eligibleDays: string[],
  answeredDays: Set<string>,
): boolean {
  return eligibleDays.some((day) => !answeredDays.has(day));
}

/**
 * Builds the all-day "REVISAR CALENDARIO ROL" reminder placed on the last day
 * of the month before the one with unanswered days, nudging the user to fill
 * it in.
 *
 * @param {ReminderEventInput} input - Already-resolved reminder and recipient data.
 * @returns {IcsAllDayEvent} The all-day event.
 */
export function buildReminderEvent(input: ReminderEventInput): IcsAllDayEvent {
  const t = createFeedTranslator(input.locale);

  // Pinned to UTC to match the Date built on the next line: without it the
  // formatter follows the process timezone, and under a negative offset a month
  // built at UTC midnight would render as the previous one.
  const monthLabel = new Intl.DateTimeFormat(input.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input.month}-01T00:00:00.000Z`));

  const line = t("calendarFeed.reminderDescription", { month: monthLabel });

  return {
    kind: "allDay",
    uid: `reminder-${input.month}-${input.userId}@dmuster`,
    summary: t("calendarFeed.reminderTitle"),
    description: input.appUrl ? `${line}\n${input.appUrl}/availability` : line,
    url: input.appUrl ? `${input.appUrl}/availability` : null,
    dateIso: input.dateIso,
    lastModified: input.now,
  };
}
