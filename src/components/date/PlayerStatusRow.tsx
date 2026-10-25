"use client";

import { useTranslation } from "react-i18next";

import StatusPill from "@/components/date/StatusPill";
import type { PlayerStatusValue } from "@/lib/calendarService";
import type { BusySession } from "@/lib/sessionConflict";

interface PlayerStatusRowProps {
  /** The member's display name. */
  name: string;
  /** Whether the member is a DM of the campaign (shows the "Máster" badge). */
  isDm: boolean;
  /** Whether the campaign's requirements make this player optional (shows "Opcional"). */
  isOptional?: boolean;
  /** The member's stored response, or `null` when unanswered. */
  status: PlayerStatusValue;
  /** The other campaign's session the member already attends that day, if any. */
  busyIn?: BusySession | null;
}

/**
 * One member's row inside a campaign viability card: an avatar initial, the
 * member's name, a "Máster" badge for DMs or a muted "Opcional" one for players
 * the campaign's requirements do not need (roadmap #25), and a status pill (Sí / Sí (Online) /
 * Tal vez / No / Sin responder, or "Juega en AC" when they already play another
 * campaign's session that day). Pending members (no stored response) render the
 * neutral "Sin responder" pill.
 *
 * @param {PlayerStatusRowProps} props
 * @returns {JSX.Element}
 */
export default function PlayerStatusRow({
  name,
  isDm,
  isOptional = false,
  status,
  busyIn,
}: PlayerStatusRowProps) {
  const { t } = useTranslation();
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink">{name}</span>
      {isDm ? (
        <span className="shrink-0 rounded-[var(--radius-control)] bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
          {t("date.dmBadge")}
        </span>
      ) : isOptional ? (
        <span className="shrink-0 rounded-[var(--radius-control)] border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("date.optionalBadge")}
        </span>
      ) : null}
      <StatusPill status={status} busyIn={busyIn} />
      {/* Mirrors the card summary's chevron (h-4 w-4 + gap-2) so status pills
          line up under the viability badge. */}
      <span aria-hidden="true" className="h-4 w-4 shrink-0" />
    </div>
  );
}
