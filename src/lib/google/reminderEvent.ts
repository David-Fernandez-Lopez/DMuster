// Pure builder for the Google Calendar API v3 event body of one monthly
// availability reminder (roadmap #23.4). Mirrors calendarEvent.ts's shape and
// its precedent for staying framework/network-free: the caller
// (reminderSyncService.ts) supplies already-resolved plain data. The event is
// always an all-day placeholder ("REVISAR CALENDARIO ROL") on the last day of
// the CURRENT month, nudging the user to fill in NEXT month's availability.

import { createInstance } from "i18next";

import { type AppLocale, getOptions } from "@/i18n/settings";
import { addDays } from "@/lib/date";

import type { GoogleCalendarEventBody } from "./calendarEvent";

/** Input to `buildReminderEvent`, already resolved by the caller — no ids to look up, no Prisma types. */
export type ReminderEventInput = {
  /** The month with unanswered eligible days, "YYYY-MM" (the month being reviewed, not the event's own day). */
  month: string;
  /** The event's calendar day — the last day of the CURRENT month, "YYYY-MM-DD". */
  dateIso: string;
  /** Locale of the event's OWNER (the calendar it is written to). */
  locale: AppLocale;
  /** Base app URL; the description links to `${appUrl}/availability`, or omits the line entirely when null. */
  appUrl: string | null;
};

/**
 * Builds the localized reminder title and "you have unanswered days" body,
 * appending a link to the availability screen when a base URL is configured.
 * A fresh i18next instance is created per call (mirrors
 * `calendarEvent.ts#buildDescription`) so concurrent calls for different
 * recipients' locales never share state.
 *
 * @param {string} month - The month being reviewed, "YYYY-MM".
 * @param {AppLocale} locale - Locale to translate into.
 * @param {string | null} appUrl - Base app URL, or null to omit the link line.
 * @returns {{ summary: string; description: string }} The event's title and body.
 */
function buildReminderCopy(
  month: string,
  locale: AppLocale,
  appUrl: string | null,
): { summary: string; description: string } {
  const i18n = createInstance();
  i18n.init(getOptions(locale));
  const t = i18n.getFixedT(locale);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(`${month}-01T00:00:00.000Z`),
  );

  const summary = t("integrations.google.reminderTitle");
  const line = t("integrations.google.reminderDescription", { month: monthLabel });
  const description = appUrl ? `${line}\n${appUrl}/availability` : line;

  return { summary, description };
}

/**
 * Builds the Google Calendar API v3 event body for one user's monthly
 * availability reminder: an all-day event on `dateIso` (the last day of the
 * current month). Google's all-day `end.date` is exclusive, so a single-day
 * all-day event must end the day *after* it starts — `addDays(dateIso, 1)`,
 * not `dateIso` again (same off-by-one `calendarEvent.ts` guards against).
 *
 * @param {ReminderEventInput} input - Already-resolved reminder + recipient data.
 * @returns {GoogleCalendarEventBody} The event body ready to POST/PATCH to Google.
 */
export function buildReminderEvent(input: ReminderEventInput): GoogleCalendarEventBody {
  const { month, dateIso, locale, appUrl } = input;
  const { summary, description } = buildReminderCopy(month, locale, appUrl);

  return {
    summary,
    description,
    start: { date: dateIso },
    end: { date: addDays(dateIso, 1) },
    extendedProperties: {
      private: { dmusterReminderMonth: month },
    },
  };
}
