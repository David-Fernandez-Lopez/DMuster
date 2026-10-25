"use client";

import { useTranslation } from "react-i18next";

import type { PlayerStatusValue } from "@/lib/calendarService";
import type { BusySession } from "@/lib/sessionConflict";
import type { ResponseStatus } from "@/lib/viability";

/** Soft-pill classes + label key per response value (null = pending). */
const STATUS_STYLE: Record<
  ResponseStatus | "NONE",
  { className: string; labelKey: string }
> = {
  YES: { className: "bg-s-soft text-s", labelKey: "date.status.yes" },
  ONLINE: { className: "bg-o-soft text-o", labelKey: "date.status.online" },
  MAYBE: { className: "bg-t-soft text-t", labelKey: "date.status.maybe" },
  NO: { className: "bg-n-soft text-n", labelKey: "date.status.no" },
  NONE: {
    className: "border border-border bg-bg text-ink-muted",
    labelKey: "date.status.none",
  },
};

const PILL_CLASS =
  "shrink-0 rounded-[var(--radius-control)] px-2 py-0.5 text-xs font-semibold";

interface StatusPillProps {
  /** The member's stored response, or `null` when unanswered. */
  status: PlayerStatusValue;
  /** The other campaign's session the member already attends that day, if any. */
  busyIn?: BusySession | null;
}

/**
 * A member's status pill for one day: their answer (Sí / Sí (Online) / Tal vez
 * / No / Sin responder) or, when they already attend another campaign's
 * session that day, the "Ocupado"-tinted "Juega en AC" pill with that
 * campaign's full name as a tooltip. Being busy overrides the answer, exactly
 * as it does for the campaign's viability. Shared by `PlayerStatusRow`,
 * `AttendeeControls` and `ForceSessionForm`.
 *
 * @param {StatusPillProps} props
 * @returns {JSX.Element}
 */
export default function StatusPill({ status, busyIn }: StatusPillProps) {
  const { t } = useTranslation();

  if (busyIn) {
    return (
      <span title={busyIn.campaignName} className={`${PILL_CLASS} bg-b-soft text-b`}>
        {t("date.status.busy", { tag: busyIn.campaignTag })}
      </span>
    );
  }

  const style = STATUS_STYLE[status ?? "NONE"];
  return <span className={`${PILL_CLASS} ${style.className}`}>{t(style.labelKey)}</span>;
}
