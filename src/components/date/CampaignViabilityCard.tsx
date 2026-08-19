"use client";

import { useTranslation } from "react-i18next";

import PlayerStatusRow from "@/components/date/PlayerStatusRow";
import AttendeeControls, {
  type AttendeeListMember,
} from "@/components/sessions/AttendeeControls";
import CancelSessionButton from "@/components/sessions/CancelSessionButton";
import ConfirmSessionForm from "@/components/sessions/ConfirmSessionForm";
import ForceSessionForm from "@/components/sessions/ForceSessionForm";
import SelfJoinButton from "@/components/sessions/SelfJoinButton";
import type { CampaignDayViability } from "@/lib/calendarService";
import type { Viability } from "@/lib/viability";

interface CampaignViabilityCardProps {
  /** The selected day, "YYYY-MM-DD" — needed to confirm a new session. */
  date: string;
  /** One campaign's viability and per-member breakdown for the selected day. */
  campaign: CampaignDayViability;
  /** The logged-in user's id, to tell whether they are a DM of this campaign. */
  currentUserId: string;
}

/** Soft-pill classes + label key per viability tier. */
const VIABILITY_STYLE: Record<Viability, { className: string; labelKey: string }> =
  {
    S: { className: "bg-s-soft text-s", labelKey: "calendar.viability.S" },
    N: { className: "bg-n-soft text-n", labelKey: "calendar.viability.N" },
    T: { className: "bg-t-soft text-t", labelKey: "calendar.viability.T" },
  };

/**
 * Formats a confirmed session's time summary: "HH:MM · N min" when both a
 * start time and a duration are set, just "HH:MM" for a timed session with no
 * duration (allowed by the data model though the confirm form never produces
 * it), or the translated all-day label when there is no start time at all.
 *
 * @param {{ startTime: string | null; durationMinutes: number | null }} session - The session's time fields.
 * @param {(key: string) => string} t - Translation function.
 * @returns {string} The rendered time summary.
 */
function formatSessionTime(
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

/**
 * Small checkmark badge marking a confirmed session, shown next to the
 * viability pill in the card summary.
 *
 * @returns {JSX.Element}
 */
function ConfirmedBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-brand">
      <path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A collapsible card for one of the user's campaigns inside the day modal. The
 * summary (always visible) shows the campaign name with its viability badge (Sí /
 * No / Tal vez), a checkmark when a session is confirmed, and a chevron.
 * Expanding an **unconfirmed** day reveals the alphabetically ordered member
 * rows with each member's response (`PlayerStatusRow`), followed by either a
 * DM's confirm action (viable `S` day) or the master override, "Forzar
 * partida" (non-viable day, roadmap #22, `ForceSessionForm`). Expanding a
 * **confirmed** day skips that member list — it would just duplicate the
 * attendee list below — and shows the session block directly: its time
 * summary, the attendee list with add/remove controls for a DM
 * (`AttendeeControls`, roadmap #22, itself showing every member's answer), and
 * then either a DM's edit-time/cancel controls (roadmap #21) or — for a
 * non-attending member who answered Sí — "Sumarme a la partida"
 * (`SelfJoinButton`, roadmap #22), with the blocked case explained inline
 * instead of a disabled button. Built on native `<details>/<summary>` so it is
 * collapsed by default, accessible and keyboard-operable with no state. The
 * per-member ordering is decided upstream in `getCalendarViability`.
 *
 * @param {CampaignViabilityCardProps} props
 * @returns {JSX.Element}
 */
export default function CampaignViabilityCard({
  date,
  campaign,
  currentUserId,
}: CampaignViabilityCardProps) {
  const { t } = useTranslation();
  const style = VIABILITY_STYLE[campaign.viability];
  const viewerIsDm =
    campaign.players.find((player) => player.userId === currentUserId)
      ?.isDm ?? false;
  const { confirmedSession } = campaign;

  const attendeeIdSet = new Set(
    confirmedSession?.attendees.map((attendee) => attendee.userId) ?? [],
  );
  const attendeeMembers: AttendeeListMember[] = campaign.players.map((player) => ({
    ...player,
    isAttending: attendeeIdSet.has(player.userId),
  }));

  return (
    <details
      className={`group rounded-[var(--radius-card)] border border-border ${confirmedSession ? "bg-brand-soft" : "bg-bg"}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center font-display text-sm font-semibold text-ink-muted"
        >
          {campaign.tag}
        </span>
        <h3 className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
          {campaign.name}
        </h3>
        {confirmedSession ? <ConfirmedBadgeIcon /> : null}
        <span
          className={`shrink-0 rounded-[var(--radius-control)] px-2 py-0.5 text-xs font-semibold ${style.className}`}
        >
          {t(style.labelKey)}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        >
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <div className="flex flex-col gap-3 px-3 pb-3">
        {!confirmedSession ? (
          <div className="divide-y divide-border">
            {campaign.players.map((player) => (
              <PlayerStatusRow
                key={player.userId}
                name={player.name}
                isDm={player.isDm}
                status={player.status}
              />
            ))}
          </div>
        ) : null}

        {confirmedSession ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-brand">
              {t("sessions.confirmed")}
              {" — "}
              {formatSessionTime(confirmedSession, t)}
            </p>

            {campaign.viability !== "S" ? (
              <p className="text-sm text-n">
                {t("sessions.warning.noLongerViable", {
                  players: campaign.players
                    .filter((player) => player.status !== "YES")
                    .map((player) => player.name)
                    .join(", "),
                })}
              </p>
            ) : null}

            <AttendeeControls
              sessionId={confirmedSession.id}
              members={attendeeMembers}
              viewerIsDm={viewerIsDm}
            />

            {viewerIsDm ? (
              <div className="flex flex-col gap-2">
                <ConfirmSessionForm
                  campaignId={campaign.campaignId}
                  date={date}
                  session={{
                    id: confirmedSession.id,
                    startTime: confirmedSession.startTime,
                    durationMinutes: confirmedSession.durationMinutes,
                  }}
                />
                <CancelSessionButton sessionId={confirmedSession.id} />
              </div>
            ) : confirmedSession.viewerCanSelfJoin ? (
              <SelfJoinButton sessionId={confirmedSession.id} />
            ) : confirmedSession.viewerSelfJoinBlockedBy ? (
              <p className="text-xs text-n">
                {t("sessions.selfJoinBlocked", {
                  campaign: confirmedSession.viewerSelfJoinBlockedBy,
                })}
              </p>
            ) : null}
          </div>
        ) : viewerIsDm ? (
          campaign.viability === "S" ? (
            <ConfirmSessionForm campaignId={campaign.campaignId} date={date} />
          ) : (
            <ForceSessionForm
              campaignId={campaign.campaignId}
              date={date}
              players={campaign.players}
              currentUserId={currentUserId}
            />
          )
        ) : null}
      </div>
    </details>
  );
}
