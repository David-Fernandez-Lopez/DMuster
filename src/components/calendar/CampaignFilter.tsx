"use client";

import type { CalendarCampaign } from "@/lib/calendarService";

interface CampaignFilterProps {
  /** The user's campaigns (the toggle chips), sorted by name. */
  campaigns: CalendarCampaign[];
  /** Tags currently active (visible on the calendar). */
  activeTags: Set<string>;
  /** Toggles a campaign tag on/off. */
  onToggle: (tag: string) => void;
  /** Accessible label for the chip group. */
  label: string;
}

/**
 * Toggle chips above the calendar, one per campaign the user belongs to, that
 * filter which campaigns' viability indicators show on the grid. Filtering is
 * purely client-side over the already-fetched model. All chips active means "no
 * filter" (show every campaign); an excluded chip is dimmed. Rendered only when
 * the user has more than one campaign — a single campaign needs no filter.
 *
 * @param {CampaignFilterProps} props
 * @returns {JSX.Element | null}
 */
export default function CampaignFilter({
  campaigns,
  activeTags,
  onToggle,
  label,
}: CampaignFilterProps) {
  if (campaigns.length <= 1) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap justify-center gap-2"
    >
      {campaigns.map((campaign) => {
        const isActive = activeTags.has(campaign.tag);
        return (
          <button
            key={campaign.id}
            type="button"
            onClick={() => onToggle(campaign.tag)}
            aria-pressed={isActive}
            title={campaign.name}
            className={`min-h-[32px] rounded-[var(--radius-control)] border px-3 text-xs font-semibold transition-colors ${
              isActive
                ? "border-brand bg-brand-soft text-brand"
                : "border-border bg-bg text-ink-muted opacity-60 hover:opacity-100"
            }`}
          >
            {campaign.tag}
          </button>
        );
      })}
    </div>
  );
}
