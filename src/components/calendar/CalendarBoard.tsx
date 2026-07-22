"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import CalendarGrid from "@/components/calendar/CalendarGrid";
import CampaignFilter from "@/components/calendar/CampaignFilter";
import FiltersModal from "@/components/calendar/FiltersModal";
import type {
  CalendarCampaign,
  CampaignDayViability,
} from "@/lib/calendarService";

type CalendarBoardProps = {
  /** The visible month, "YYYY-MM". */
  month: string;
  /** Monday-first grid days from `monthGridDays(month)`. */
  days: string[];
  /** Holiday dates as "YYYY-MM-DD" strings, for eligibility. */
  holidays: string[];
  /** Today's date, "YYYY-MM-DD", for the today ring. */
  today: string;
  /** Active locale for localized weekday headers. */
  locale: string;
  /** The user's stored responses across the grid range, keyed by day. */
  initialResponses: Record<string, "YES" | "NO" | "MAYBE">;
  /** The user's campaigns, for the filter chips. */
  campaigns: CalendarCampaign[];
  /** Per eligible date, the viability of each of the user's campaigns. */
  viabilityByDate: Record<string, CampaignDayViability[]>;
  /** The server-rendered month selector, placed between the "Filtros" trigger and the grid. */
  children: React.ReactNode;
};

/**
 * Owns the campaign filter state shared by the "Filtros" trigger (rendered
 * above the month selector) and `CalendarGrid` (below it), with the
 * server-rendered `MonthNav` passed in as `children` so it can sit between
 * them without becoming a client component itself. All chips active means
 * "no filter" (show every campaign). The trigger and its modal are only
 * rendered when the user has more than one campaign — a single campaign needs
 * no filter. The parent must remount this per month (`key={month}`) so the
 * filter state does not carry across `?month=` navigations.
 *
 * @param {CalendarBoardProps} props
 * @returns {JSX.Element}
 */
export default function CalendarBoard({
  month,
  days,
  holidays,
  today,
  locale,
  initialResponses,
  campaigns,
  viabilityByDate,
  children,
}: CalendarBoardProps) {
  const { t } = useTranslation();
  const [activeTags, setActiveTags] = useState<Set<string>>(
    () => new Set(campaigns.map((campaign) => campaign.tag)),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  /**
   * Toggles a campaign tag in the filter; all tags active means "no filter".
   *
   * @param {string} tag - The campaign tag toggled.
   */
  function toggleTag(tag: string) {
    setActiveTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  const filterLabel = t("calendar.filter.label");

  return (
    <>
      {campaigns.length > 1 ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-border px-4 text-sm font-semibold text-ink transition-colors hover:bg-brand-soft"
          >
            {t("calendar.filter.button")}
            {activeTags.size !== campaigns.length
              ? ` (${activeTags.size}/${campaigns.length})`
              : ""}
          </button>
        </div>
      ) : null}

      <div className="mt-6">{children}</div>

      <div className="mt-4">
        <CalendarGrid
          month={month}
          days={days}
          holidays={holidays}
          today={today}
          locale={locale}
          initialResponses={initialResponses}
          campaigns={campaigns}
          viabilityByDate={viabilityByDate}
          activeTags={activeTags}
        />
      </div>

      {filtersOpen ? (
        <FiltersModal title={filterLabel} onClose={() => setFiltersOpen(false)}>
          <CampaignFilter
            campaigns={campaigns}
            activeTags={activeTags}
            onToggle={toggleTag}
            label={filterLabel}
          />
        </FiltersModal>
      ) : null}
    </>
  );
}
