"use client";

import { useTranslation } from "react-i18next";

import CancelSessionButton from "@/components/sessions/CancelSessionButton";
import type { UpcomingSessionDto } from "@/lib/confirmedSessionService";
import { toUtcDate } from "@/lib/date";

interface SessionCardProps {
  session: UpcomingSessionDto;
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
        {session.startTime
          ? `${session.startTime} · ${session.durationMinutes} ${t("sessions.durationUnit")}`
          : t("sessions.allDay")}
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
