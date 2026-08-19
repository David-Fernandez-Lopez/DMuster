"use client";

import { useTranslation } from "react-i18next";

import AttendeeControls, {
  type AttendeeListMember,
} from "@/components/sessions/AttendeeControls";
import CancelSessionButton from "@/components/sessions/CancelSessionButton";
import SelfJoinButton from "@/components/sessions/SelfJoinButton";
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
 * for an all-day session), and the attendee list with add/remove controls for
 * a DM (`AttendeeControls`) — in roadmap #21 always the full campaign
 * membership, roadmap #22 makes it vary and adds the greyed-out "not
 * attending" section. A DM of the session's campaign also gets the cancel
 * control; a non-attending member who answered Sí gets "Sumarme a la
 * partida" instead, with the blocked case explained inline.
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

  const attendeeIdSet = new Set(session.attendees.map((attendee) => attendee.userId));
  const members: AttendeeListMember[] = session.campaignMembers.map((member) => ({
    ...member,
    isAttending: attendeeIdSet.has(member.userId),
  }));

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
        <AttendeeControls
          sessionId={session.id}
          members={members}
          viewerIsDm={session.viewerIsDm}
        />
      </div>

      {session.viewerIsDm ? (
        <div className="mt-3">
          <CancelSessionButton sessionId={session.id} />
        </div>
      ) : session.viewerCanSelfJoin ? (
        <div className="mt-3">
          <SelfJoinButton sessionId={session.id} />
        </div>
      ) : session.viewerSelfJoinBlockedBy ? (
        <p className="mt-3 text-xs text-n">
          {t("sessions.selfJoinBlocked", {
            campaign: session.viewerSelfJoinBlockedBy,
          })}
        </p>
      ) : null}
    </li>
  );
}
