import { todayIsoIn } from "@/lib/date";
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
