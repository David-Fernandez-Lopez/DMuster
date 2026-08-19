// Pure builder for the Google Calendar API v3 event body of one confirmed
// session, for one attendee (roadmap #23). No Prisma and no network calls —
// the caller (calendarSyncService.ts) supplies already-resolved plain data, so
// this stays trivially unit-testable (see roadmap #17's precedent with
// viability.ts). Session times are stored as timezone-less "HH:MM" wall-clock
// strings (see `ConfirmedSession.startTime` in schema.prisma); this module
// never converts to UTC — the `timeZone` field lets Google resolve the
// correct instant itself, DST included.

import { createInstance } from "i18next";

import { type AppLocale, getOptions } from "@/i18n/settings";
import { addDays } from "@/lib/date";

/** Minutes in a full day, used to carry a session's end time past midnight. */
const MINUTES_PER_DAY = 24 * 60;

/** Applied when a session has a start time but no explicit duration. */
const DEFAULT_EVENT_DURATION_MINUTES = 240;

/**
 * A Google Calendar event boundary: a specific instant (timed session, with
 * an explicit `timeZone` so Google — not this app — resolves DST) or a whole
 * calendar day (all-day session).
 */
export type GoogleCalendarEventBoundary =
  | { dateTime: string; timeZone: string }
  | { date: string };

/**
 * The subset of the Google Calendar API v3 Event resource this app writes.
 * No `attendees` field by design (roadmap #23 locked decision): DMuster never
 * uses Google's own guest list, so nobody gets an invitation email from
 * Google — instead one independent event is created per attendee, on their
 * own calendar.
 */
export type GoogleCalendarEventBody = {
  summary: string;
  description: string;
  start: GoogleCalendarEventBoundary;
  end: GoogleCalendarEventBoundary;
  // Loosened to a string map (not just `{ dmusterSessionId }`) so
  // `reminderEvent.ts` can reuse this same body type with its own
  // `dmusterReminderMonth` tracing key instead of duplicating it.
  extendedProperties: {
    private: Record<string, string>;
  };
};

/** Input to `buildCalendarEvent`, already resolved by the caller — no ids to look up, no Prisma types. */
export type CalendarEventInput = {
  sessionId: string;
  campaignName: string;
  /** The session's calendar day, "YYYY-MM-DD". */
  dateIso: string;
  /** "HH:MM" local wall time, or null for an all-day session. */
  startTime: string | null;
  /** Only meaningful with `startTime`; defaults to 4 hours when a start time is set but no duration was chosen. */
  durationMinutes: number | null;
  /** Display names of everyone attending, listed in the event description. */
  attendeeNames: string[];
  /** Locale of the event's OWNER (the calendar it is written to), not the confirming DM. */
  locale: AppLocale;
  /** IANA timezone name (`env.APP_TIMEZONE`) attached to every timed boundary. */
  timezone: string;
  /** Base app URL; the description links to `${appUrl}/sessions`, or omits the line entirely when null. */
  appUrl: string | null;
};

/**
 * Builds the localized "who's playing" description line and appends a link
 * to the app's sessions list when a base URL is configured. A fresh i18next
 * instance is created per call (mirrors `getServerTranslation`) so concurrent
 * calls for different recipients' locales never share state; resolution is
 * synchronous because `getOptions` bundles resources statically and disables
 * `initAsync` — the same guarantee `src/i18n/client.ts` relies on.
 *
 * @param {string[]} attendeeNames - Display names of everyone attending.
 * @param {AppLocale} locale - Locale to translate the description into.
 * @param {string | null} appUrl - Base app URL, or null to omit the link line.
 * @returns {string} The finished event description.
 */
function buildDescription(
  attendeeNames: string[],
  locale: AppLocale,
  appUrl: string | null,
): string {
  const i18n = createInstance();
  i18n.init(getOptions(locale));
  const t = i18n.getFixedT(locale);

  const line = t("integrations.google.eventDescription", {
    players: attendeeNames.join(", "),
  });

  return appUrl ? `${line}\n${appUrl}/sessions` : line;
}

/**
 * Adds a number of minutes to a "HH:MM" wall-clock time anchored on a given
 * calendar day, carrying over into the next day when the sum passes
 * midnight — the case a several-hour session starting late in the evening
 * hits routinely. Pure integer math, no `Date`/timezone involved.
 *
 * @param {string} dateIso - The start day, "YYYY-MM-DD".
 * @param {string} startTime - The start time, "HH:MM".
 * @param {number} minutesToAdd - Minutes to add (non-negative).
 * @returns {{ dateIso: string; time: string }} The resulting day and "HH:MM" time.
 */
function addWallClockMinutes(
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
 * Builds the Google Calendar API v3 event body for one confirmed session, for
 * one attendee's calendar. A session with a `startTime` becomes a timed event
 * spanning `durationMinutes` (or 4 hours by default); a session without one
 * becomes an all-day event. Google's all-day `end.date` is exclusive, so a
 * single-day all-day session must end the day *after* it starts —
 * `addDays(dateIso, 1)`, not `dateIso` again.
 *
 * @param {CalendarEventInput} input - Already-resolved session + recipient data.
 * @returns {GoogleCalendarEventBody} The event body ready to POST/PATCH to Google.
 */
export function buildCalendarEvent(input: CalendarEventInput): GoogleCalendarEventBody {
  const {
    sessionId,
    campaignName,
    dateIso,
    startTime,
    durationMinutes,
    attendeeNames,
    locale,
    timezone,
    appUrl,
  } = input;

  let start: GoogleCalendarEventBoundary;
  let end: GoogleCalendarEventBoundary;

  if (startTime) {
    start = { dateTime: `${dateIso}T${startTime}:00`, timeZone: timezone };
    const { dateIso: endDateIso, time: endTime } = addWallClockMinutes(
      dateIso,
      startTime,
      durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES,
    );
    end = { dateTime: `${endDateIso}T${endTime}:00`, timeZone: timezone };
  } else {
    start = { date: dateIso };
    end = { date: addDays(dateIso, 1) };
  }

  return {
    summary: campaignName,
    description: buildDescription(attendeeNames, locale, appUrl),
    start,
    end,
    extendedProperties: {
      private: { dmusterSessionId: sessionId },
    },
  };
}
