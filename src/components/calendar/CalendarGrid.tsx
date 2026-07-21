"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ResponseStatus } from "@/components/availability/AvailabilityToggle";
import CampaignFilter from "@/components/calendar/CampaignFilter";
import DayAvailabilityModal from "@/components/calendar/DayAvailabilityModal";
import DayCell, { type DayIndicator } from "@/components/calendar/DayCell";
import type {
  CalendarCampaign,
  CampaignDayViability,
} from "@/lib/calendarService";
import { isEligible, toUtcDate } from "@/lib/date";
import type { Viability } from "@/lib/viability";

/** How many chips a cell shows on mobile before collapsing the rest into "+N". */
const MOBILE_MAX_CHIPS = 6;

/** Chip ordering priority: available first, then maybe, then unavailable. */
const VIABILITY_ORDER: Record<Viability, number> = { S: 0, T: 1, N: 2 };

type CalendarGridProps = {
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
  /** Tags of the user's campaigns, shown in the day modal ("Afecta a"). */
  tags: string[];
  /** The user's stored responses across the grid range, keyed by day. */
  initialResponses: Record<string, "YES" | "NO" | "MAYBE">;
  /** The user's campaigns, for the filter chips. */
  campaigns: CalendarCampaign[];
  /** Per eligible date, the viability of each of the user's campaigns. */
  viabilityByDate: Record<string, CampaignDayViability[]>;
};

/**
 * Capitalizes the first character of a localized name (e.g. "lun" → "Lun",
 * "julio de 2026" → "Julio de 2026"), since `Intl` lowercases some locales.
 *
 * @param {string} value - The string to capitalize.
 * @returns {string} The value with its first character uppercased.
 */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The 7-column monthly calendar grid: a Monday-first weekday header row over the
 * day cells, with per-campaign viability chips on eligible days and campaign
 * filter chips above it. Weekday names come from `Intl` (no i18n keys). Cells are
 * separated by 1px gaps over the border color for the sheet-style line effect.
 *
 * This is the calendar's client boundary. Tapping an eligible day opens the
 * availability modal (no navigation), which also shows that day's per-campaign
 * breakdown. It holds a live `responses` map so a day reopened after a change
 * shows the fresh own status without a refetch; after a response persists it
 * calls `router.refresh()` so the server-computed viability (cell chips and the
 * breakdown) reflects the new answer. Campaign filtering is client-side over the
 * already-fetched model — all chips active means "show all". The parent must
 * remount it per month (`key={month}`) so state does not carry across `?month=`
 * navigations.
 *
 * @param {CalendarGridProps} props
 * @returns {JSX.Element}
 */
export default function CalendarGrid({
  month,
  days,
  holidays,
  today,
  locale,
  tags,
  initialResponses,
  campaigns,
  viabilityByDate,
}: CalendarGridProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const holidaySet = new Set(holidays);
  const [selected, setSelected] = useState<string | null>(null);
  const [responses, setResponses] =
    useState<Record<string, "YES" | "NO" | "MAYBE">>(initialResponses);
  const [activeTags, setActiveTags] = useState<Set<string>>(
    () => new Set(campaigns.map((campaign) => campaign.tag)),
  );

  /**
   * Reconciles the live responses map after the modal persists a change, then
   * refreshes the server data so the per-campaign viability reflects it.
   *
   * @param {string} date - The day that changed, "YYYY-MM-DD".
   * @param {ResponseStatus} status - The persisted status, or `null` if cleared.
   */
  function handlePersisted(date: string, status: ResponseStatus) {
    setResponses((current) => {
      const next = { ...current };
      if (status === null) {
        delete next[date];
      } else {
        next[date] = status;
      }
      return next;
    });
    router.refresh();
  }

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

  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });

  // The first row of the grid is always Monday–Sunday; format those seven days.
  const weekdayHeaders = days
    .slice(0, 7)
    .map((iso) => capitalize(weekdayFormatter.format(toUtcDate(iso))));

  const allActive = activeTags.size === campaigns.length;

  /**
   * Builds a cell's viability chips after applying the active-campaign filter,
   * ordered by viability (available → maybe → unavailable) so the most useful
   * ones lead and never fall into the mobile overflow. The sort is stable, so
   * campaigns keep their name order within each tier. Also returns the mobile
   * "+N" overflow label (desktop shows every chip).
   *
   * @param {string} iso - The day, "YYYY-MM-DD".
   * @returns {{ indicators: DayIndicator[]; moreLabel: string | null }}
   */
  function cellIndicators(iso: string): {
    indicators: DayIndicator[];
    moreLabel: string | null;
  } {
    const dayCampaigns = viabilityByDate[iso] ?? [];
    const shown = allActive
      ? dayCampaigns
      : dayCampaigns.filter((campaign) => activeTags.has(campaign.tag));
    const indicators = shown
      .map((campaign) => ({
        tag: campaign.tag,
        viability: campaign.viability,
      }))
      .sort((a, b) => VIABILITY_ORDER[a.viability] - VIABILITY_ORDER[b.viability]);
    const overflow = indicators.length - MOBILE_MAX_CHIPS;
    return {
      indicators,
      moreLabel:
        overflow > 0 ? t("calendar.moreChips", { count: overflow }) : null,
    };
  }

  return (
    <>
      <div className="mb-4">
        <CampaignFilter
          campaigns={campaigns}
          activeTags={activeTags}
          onToggle={toggleTag}
          label={t("calendar.filter.label")}
        />
      </div>

      <div className="grid grid-cols-7 gap-px border border-border bg-border">
        {weekdayHeaders.map((label, index) => (
          <div
            key={index}
            className="bg-bg-elevated py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted"
          >
            {label}
          </div>
        ))}
        {days.map((iso) => {
          const { indicators, moreLabel } = cellIndicators(iso);
          return (
            <DayCell
              key={iso}
              iso={iso}
              eligible={isEligible(iso, holidaySet)}
              today={iso === today}
              outOfMonth={!iso.startsWith(month)}
              onSelect={setSelected}
              indicators={indicators}
              moreLabel={moreLabel}
            />
          );
        })}
      </div>

      {selected !== null ? (
        <DayAvailabilityModal
          date={selected}
          tags={tags}
          initialStatus={responses[selected] ?? null}
          detail={viabilityByDate[selected] ?? []}
          onPersisted={handlePersisted}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
