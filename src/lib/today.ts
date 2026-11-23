import { toIsoDateIn, toTimeIn, todayIsoIn } from "@/lib/date";
import { env } from "@/lib/env";

/**
 * Returns today's calendar day as "YYYY-MM-DD" in the application's configured
 * timezone.
 *
 * This lives apart from the rest of the date helpers because it is the one that
 * needs configuration, and `@/lib/date` is deliberately free of imports so it
 * stays trivially unit-testable. Binding the timezone in exactly one place is
 * also what keeps it from drifting: previously "today" was UTC, and the four
 * places that asked for it — the calendar's today ring and "Hoy" shortcut, the
 * upcoming-days window on /availability, the upcoming-sessions list, and the
 * self-join button — each disagreed with the players' own calendars between
 * midnight and 02:00 local.
 *
 * @returns {string} Today's date in `APP_TIMEZONE`, "YYYY-MM-DD".
 */
export function todayIso(): string {
  return todayIsoIn(env.APP_TIMEZONE);
}

/**
 * Returns the current moment as the calendar day and the clock time in the
 * application's configured timezone, for records the app stamps itself (the
 * critical/fumble log). Both come from the same instant, so a roll at 00:21
 * gets that day's date and never the previous one.
 *
 * @returns {{ date: string; time: string }} "YYYY-MM-DD" and "HH:MM".
 */
export function nowStamp(): { date: string; time: string } {
  const now = new Date();
  return {
    date: toIsoDateIn(now, env.APP_TIMEZONE),
    time: toTimeIn(now, env.APP_TIMEZONE),
  };
}
