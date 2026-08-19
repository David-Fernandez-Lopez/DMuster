"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ResponseStatus } from "@/components/availability/AvailabilityToggle";
import DayAvailabilityModal from "@/components/calendar/DayAvailabilityModal";
import DayCell, {
  MOBILE_MAX_CHIPS,
  type DayIndicator,
} from "@/components/calendar/DayCell";
import type {
  CalendarCampaign,
  CalendarMaster,
  CampaignDayViability,
} from "@/lib/calendarService";
import { isEligible, toUtcDate } from "@/lib/date";
import type { Viability } from "@/lib/viability";

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
  /** The user's stored responses across the grid range, keyed by day. */
  initialResponses: Record<string, "YES" | "NO" | "MAYBE">;
  /** The user's campaigns, for the campaign filter. */
  campaigns: CalendarCampaign[];
  /** The distinct DMs across those campaigns, for the master filter. */
  masters: CalendarMaster[];
  /** Per eligible date, the viability of each of the user's campaigns. */
  viabilityByDate: Record<string, CampaignDayViability[]>;
  /** Selected campaign ids (owned by `CalendarBoard`; all selected = no filter). */
  activeCampaignIds: Set<string>;
  /** Selected master userIds (all selected = no filter). */
  activeMasterIds: Set<string>;
  /** Selected viability tiers (all selected = no filter). */
  activeViabilities: Set<Viability>;
  /** The logged-in user's id, threaded to the day modal for DM checks. */
  currentUserId: string;
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
 * day cells, with per-campaign viability chips on eligible days. Weekday names
 * come from `Intl` (no i18n keys). Cells are separated by 1px gaps over the
 * border color for the sheet-style line effect.
 *
 * This is the calendar's client boundary. Tapping an eligible day opens the
 * availability modal (no navigation), which also shows that day's per-campaign
 * breakdown. It holds a live `responses` map so a day reopened after a change
 * shows the fresh own status without a refetch; after a response persists it
 * calls `router.refresh()` so the server-computed viability (cell chips and the
 * breakdown) reflects the new answer. Filtering (campaigns, masters and
 * viability tiers) is owned by the parent `CalendarBoard`, which renders the
 * "Filtros" trigger and modal — this component only applies the three active
 * sets (all selected in a dimension means that dimension shows all). The parent
 * remounts it per month (`key={month}`).
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
  initialResponses,
  campaigns,
  masters,
  viabilityByDate,
  activeCampaignIds,
  activeMasterIds,
  activeViabilities,
  currentUserId,
}: CalendarGridProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const holidaySet = new Set(holidays);
  const [selected, setSelected] = useState<string | null>(null);
  const [responses, setResponses] =
    useState<Record<string, "YES" | "NO" | "MAYBE">>(initialResponses);

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

  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });

  // The first row of the grid is always Monday–Sunday; format those seven days.
  const weekdayHeaders = days
    .slice(0, 7)
    .map((iso) => capitalize(weekdayFormatter.format(toUtcDate(iso))));

  const campaignsAll = activeCampaignIds.size === campaigns.length;
  const mastersAll = activeMasterIds.size === masters.length;
  const viabilitiesAll = activeViabilities.size === 3;

  /**
   * Builds a cell's viability chips after applying the active filters
   * (campaigns, masters, viability tiers, combined with AND), ordered
   * confirmed-first, then by viability (available → maybe → unavailable) so
   * pending chips read most-useful-first within their own group. Both
   * comparisons are stable, so campaigns keep their name order within each
   * group. Also returns the mobile "+N" overflow label, counting only the
   * pending (non-confirmed) chips — a confirmed session always renders in
   * full on every viewport and never falls into the overflow (desktop shows
   * every chip regardless).
   *
   * @param {string} iso - The day, "YYYY-MM-DD".
   * @returns {{ indicators: DayIndicator[]; moreLabel: string | null }}
   */
  function cellIndicators(iso: string): {
    indicators: DayIndicator[];
    moreLabel: string | null;
  } {
    const dayCampaigns = viabilityByDate[iso] ?? [];
    const shown = dayCampaigns.filter((campaign) => {
      if (!campaignsAll && !activeCampaignIds.has(campaign.campaignId)) {
        return false;
      }
      if (
        !mastersAll &&
        !campaign.players.some(
          (player) => player.isDm && activeMasterIds.has(player.userId),
        )
      ) {
        return false;
      }
      if (!viabilitiesAll && !activeViabilities.has(campaign.viability)) {
        return false;
      }
      return true;
    });
    const indicators = shown
      .map((campaign) => ({
        campaignId: campaign.campaignId,
        tag: campaign.tag,
        name: campaign.name,
        viability: campaign.viability,
        confirmed: campaign.confirmedSession !== null,
      }))
      .sort((a, b) => {
        if (a.confirmed !== b.confirmed) {
          return a.confirmed ? -1 : 1;
        }
        return VIABILITY_ORDER[a.viability] - VIABILITY_ORDER[b.viability];
      });
    const pendingCount = indicators.filter((indicator) => !indicator.confirmed).length;
    const overflow = pendingCount - MOBILE_MAX_CHIPS;
    return {
      indicators,
      moreLabel:
        overflow > 0 ? t("calendar.moreChips", { count: overflow }) : null,
    };
  }

  return (
    <>
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
          initialStatus={responses[selected] ?? null}
          detail={viabilityByDate[selected] ?? []}
          currentUserId={currentUserId}
          onPersisted={handlePersisted}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
