"use client";

import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { ForeignSessionDto } from "@/lib/calendarService";
import { formatSessionTime } from "@/lib/sessionTime";

interface OtherSessionsListProps {
  /** The day's sessions of campaigns the user is not in, ordered by start time. */
  sessions: ForeignSessionDto[];
}

/**
 * The day modal's read-only "Otras partidas este día" section: one card per
 * confirmed session of a campaign the user does not belong to, with its tag,
 * name, time summary and who plays. It is what explains the "Ocupado" pills on
 * the user's own campaign cards above. Always shown when the day has any such
 * session, regardless of the calendar filters (the modal never applies them).
 * Renders nothing when there are none.
 *
 * @param {OtherSessionsListProps} props
 * @returns {JSX.Element | null}
 */
export default function OtherSessionsList({ sessions }: OtherSessionsListProps) {
  const { t } = useTranslation();
  const titleId = useId();

  if (sessions.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={titleId} className="mt-5 flex flex-col gap-2">
      <h3 id={titleId} className="font-display text-sm font-semibold text-ink-muted">
        {t("calendar.otherSessions.title")}
      </h3>
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="rounded-[var(--radius-card)] border border-border bg-bg p-3"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center font-display text-sm font-semibold text-ink-muted"
              >
                {session.campaignTag}
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
                {session.campaignName}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {formatSessionTime(session, t)}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {t("calendar.otherSessions.players", {
                players: session.playerNames.join(", "),
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
