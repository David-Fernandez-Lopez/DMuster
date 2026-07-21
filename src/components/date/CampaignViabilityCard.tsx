"use client";

import { useTranslation } from "react-i18next";

import PlayerStatusRow from "@/components/date/PlayerStatusRow";
import type { CampaignDayViability } from "@/lib/calendarService";
import type { Viability } from "@/lib/viability";

interface CampaignViabilityCardProps {
  /** One campaign's viability and per-member breakdown for the selected day. */
  campaign: CampaignDayViability;
}

/** Soft-pill classes + label key per viability tier. */
const VIABILITY_STYLE: Record<Viability, { className: string; labelKey: string }> =
  {
    S: { className: "bg-s-soft text-s", labelKey: "calendar.viability.S" },
    N: { className: "bg-n-soft text-n", labelKey: "calendar.viability.N" },
    T: { className: "bg-t-soft text-t", labelKey: "calendar.viability.T" },
  };

/**
 * A collapsible card for one of the user's campaigns inside the day modal. The
 * summary (always visible) shows the campaign name with its viability badge (Sí /
 * No / Tal vez) and a chevron; expanding it reveals the alphabetically ordered
 * member rows with each member's response. Built on native `<details>/<summary>`
 * so it is collapsed by default, accessible and keyboard-operable with no state.
 * The per-member ordering is decided upstream in `getCalendarViability`.
 *
 * @param {CampaignViabilityCardProps} props
 * @returns {JSX.Element}
 */
export default function CampaignViabilityCard({
  campaign,
}: CampaignViabilityCardProps) {
  const { t } = useTranslation();
  const style = VIABILITY_STYLE[campaign.viability];

  return (
    <details className="group rounded-[var(--radius-card)] border border-border bg-bg">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <h3 className="min-w-0 truncate font-display text-base font-semibold text-ink">
          <span className="text-ink-muted">{campaign.tag}</span> {campaign.name}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-[var(--radius-control)] px-2 py-0.5 text-xs font-semibold ${style.className}`}
          >
            {t(style.labelKey)}
          </span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-180"
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
        </div>
      </summary>

      <div className="divide-y divide-border px-3 pb-3">
        {campaign.players.map((player) => (
          <PlayerStatusRow
            key={player.userId}
            name={player.name}
            isDm={player.isDm}
            status={player.status}
          />
        ))}
      </div>
    </details>
  );
}
