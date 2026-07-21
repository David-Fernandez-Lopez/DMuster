"use client";

import { useTranslation } from "react-i18next";

import type { PlayerStatusValue } from "@/lib/calendarService";

interface PlayerStatusRowProps {
  /** The member's display name. */
  name: string;
  /** Whether the member is a DM of the campaign (shows the "Máster" badge). */
  isDm: boolean;
  /** The member's stored response, or `null` when unanswered. */
  status: PlayerStatusValue;
}

/** Soft-pill classes + label key per response value (null = pending). */
const STATUS_STYLE: Record<
  "YES" | "NO" | "MAYBE" | "NONE",
  { className: string; labelKey: string }
> = {
  YES: { className: "bg-s-soft text-s", labelKey: "date.status.yes" },
  MAYBE: { className: "bg-t-soft text-t", labelKey: "date.status.maybe" },
  NO: { className: "bg-n-soft text-n", labelKey: "date.status.no" },
  NONE: {
    className: "border border-border bg-bg text-ink-muted",
    labelKey: "date.status.none",
  },
};

/**
 * One member's row inside a campaign viability card: an avatar initial, the
 * member's name, a "Máster" badge for DMs, and a status pill (Sí / Tal vez / No
 * / Sin responder). Pending members (no stored response) render the neutral
 * "Sin responder" pill.
 *
 * @param {PlayerStatusRowProps} props
 * @returns {JSX.Element}
 */
export default function PlayerStatusRow({
  name,
  isDm,
  status,
}: PlayerStatusRowProps) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status ?? "NONE"];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{name}</span>
      {isDm ? (
        <span className="shrink-0 rounded-[var(--radius-control)] bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
          {t("date.dmBadge")}
        </span>
      ) : null}
      <span
        className={`shrink-0 rounded-[var(--radius-control)] px-2 py-0.5 text-xs font-semibold ${style.className}`}
      >
        {t(style.labelKey)}
      </span>
      {/* Mirrors the card summary's chevron (h-4 w-4 + gap-2) so status pills
          line up under the viability badge. */}
      <span aria-hidden="true" className="h-4 w-4 shrink-0" />
    </div>
  );
}
