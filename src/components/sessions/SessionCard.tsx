"use client";

import { useTranslation } from "react-i18next";

import CancelSessionButton from "@/components/sessions/CancelSessionButton";
import type { UpcomingSessionDto } from "@/lib/confirmedSessionService";
import { toUtcDate } from "@/lib/date";

interface SessionCardProps {
  session: UpcomingSessionDto;
}

/**
 * Formats a confirmed session's time summary: "HH:MM · N min" when both a
 * start time and a duration are set, just "HH:MM" for a timed session with no
 * duration (allowed by the data model though the confirm form never produces
 * it), or the translated all-day label when there is no start time at all.
 *
 * @param {UpcomingSessionDto} session - The session's time fields.
 * @param {(key: string) => string} t - Translation function.
 * @returns {string} The rendered time summary.
 */
function formatSessionTime(
  session: Pick<UpcomingSessionDto, "startTime" | "durationMinutes">,
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

/**
 * One confirmed session on the "Próximas partidas" page: long localized date,
 * campaign name with its tag, the start time and duration (or "Todo el día"
 * for an all-day session), and the attendee list — in roadmap #21 always the
 * full campaign membership (#22 makes it vary). A DM of the session's
 * campaign gets the cancel control; other members only see the details.
 *
 * @param {SessionCardProps} props
 * @returns {JSX.Element}
 */
export default function SessionCard({ session }: SessionCardProps) {
  const { t, i18n } = useTranslation();

  const longDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(session.date));

  return (
    <li className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
      <p className="text-sm font-semibold text-ink first-letter:uppercase">
        {longDate}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center font-display text-xs font-semibold text-ink-muted"
        >
          {session.campaignTag}
        </span>
        <h2 className="min-w-0 truncate font-display text-base font-semibold text-ink">
          {session.campaignName}
        </h2>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {formatSessionTime(session, t)}
      </p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("sessions.players")}
        </p>
        <p className="mt-1 text-sm text-ink">
          {session.attendees.map((attendee) => attendee.name).join(", ")}
        </p>
      </div>

      {session.viewerIsDm ? (
        <div className="mt-3">
          <CancelSessionButton sessionId={session.id} />
        </div>
      ) : null}
    </li>
  );
}
