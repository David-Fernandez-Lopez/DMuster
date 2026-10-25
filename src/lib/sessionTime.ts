/**
 * Formats a confirmed session's time summary: "HH:MM · N min" when both a
 * start time and a duration are set, just "HH:MM" for a timed session with no
 * duration (allowed by the data model though the confirm form never produces
 * it), or the translated all-day label when there is no start time at all.
 * Shared by the day modal's campaign cards, its "Otras partidas" list and the
 * "Próximas partidas" page.
 *
 * @param {{ startTime: string | null; durationMinutes: number | null }} session - The session's time fields.
 * @param {(key: string) => string} t - Translation function.
 * @returns {string} The rendered time summary.
 */
export function formatSessionTime(
  session: { startTime: string | null; durationMinutes: number | null },
  t: (key: string) => string,
): string {
  if (!session.startTime) {
    return t("sessions.allDay");
  }
  if (!session.durationMinutes) {
    return session.startTime;
  }
  return `${session.startTime} · ${session.durationMinutes} ${t("sessions.durationUnit")}`;
}
