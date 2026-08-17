"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import CalendarFilters from "@/components/calendar/CalendarFilters";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import FiltersModal from "@/components/calendar/FiltersModal";
import {
  ALL_VIABILITIES,
  getServerFiltersSnapshot,
  getStoredFiltersSnapshot,
  parseStoredSelection,
  subscribeCalendarFilters,
  writeStoredSelection,
} from "@/lib/calendarFilterStorage";
import type {
  CalendarCampaign,
  CalendarMaster,
  CampaignDayViability,
} from "@/lib/calendarService";
import type { Viability } from "@/lib/viability";

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
  /** The user's campaigns, for the campaign filter. */
  campaigns: CalendarCampaign[];
  /** The distinct DMs across those campaigns, for the master filter. */
  masters: CalendarMaster[];
  /** Per eligible date, the viability of each of the user's campaigns. */
  viabilityByDate: Record<string, CampaignDayViability[]>;
  /** The logged-in user's id, threaded down to the day modal for DM checks. */
  currentUserId: string;
  /** The server-rendered month selector, placed between the "Filtros" trigger and the grid. */
  children: React.ReactNode;
};

/**
 * Owns the calendar's multi-dimension filter state shared by the "Filtros"
 * trigger (rendered above the month selector) and `CalendarGrid` (below it),
 * with the server-rendered `MonthNav` passed in as `children` so it can sit
 * between them without becoming a client component itself.
 *
 * Three dimensions narrow which per-campaign chips the grid shows — campaigns,
 * masters (DMs) and viability tiers — each with the convention "all selected =
 * off". The selection is persisted to `localStorage` and read through
 * `useSyncExternalStore` (see `calendarFilterStorage`), so it survives both a
 * reload and the per-month remount (`key={month}`) without a hydration mismatch
 * or a set-state-in-effect: the server snapshot is the "all shown" default and
 * the client snapshot hydrates the stored selection. The trigger is shown
 * whenever the user has at least one campaign.
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
  masters,
  viabilityByDate,
  currentUserId,
  children,
}: CalendarBoardProps) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const allCampaignIds = useMemo(
    () => campaigns.map((campaign) => campaign.id),
    [campaigns],
  );
  const allMasterIds = useMemo(
    () => masters.map((master) => master.userId),
    [masters],
  );

  const raw = useSyncExternalStore(
    subscribeCalendarFilters,
    getStoredFiltersSnapshot,
    getServerFiltersSnapshot,
  );
  const {
    campaignIds: activeCampaignIds,
    masterIds: activeMasterIds,
    viabilities: activeViabilities,
  } = useMemo(
    () => parseStoredSelection(raw, allCampaignIds, allMasterIds),
    [raw, allCampaignIds, allMasterIds],
  );

  /**
   * Persists a full new selection, defaulting each dimension to its current
   * value so a caller need only pass the dimension it changed.
   *
   * @param {Partial<{ campaignIds: Set<string>; masterIds: Set<string>; viabilities: Set<Viability> }>} next - The changed dimension(s).
   */
  function persist(next: {
    campaignIds?: Set<string>;
    masterIds?: Set<string>;
    viabilities?: Set<Viability>;
  }) {
    writeStoredSelection(
      {
        campaignIds: next.campaignIds ?? activeCampaignIds,
        masterIds: next.masterIds ?? activeMasterIds,
        viabilities: next.viabilities ?? activeViabilities,
      },
      allCampaignIds,
      allMasterIds,
    );
  }

  function toggleViability(viability: Viability) {
    const next = new Set(activeViabilities);
    if (next.has(viability)) {
      next.delete(viability);
    } else {
      next.add(viability);
    }
    persist({ viabilities: next });
  }

  function clearFilters() {
    persist({
      campaignIds: new Set(allCampaignIds),
      masterIds: new Set(allMasterIds),
      viabilities: new Set(ALL_VIABILITIES),
    });
  }

  // How many dimensions are narrowed — drives the trigger's active state/badge.
  const activeDimensions =
    (activeCampaignIds.size !== allCampaignIds.length ? 1 : 0) +
    (activeMasterIds.size !== allMasterIds.length ? 1 : 0) +
    (activeViabilities.size !== ALL_VIABILITIES.length ? 1 : 0);

  return (
    <>
      {campaigns.length > 0 ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={`btn min-h-[44px] px-4 text-sm font-semibold ${
              activeDimensions > 0 ? "btn-primary" : "btn-secondary"
            }`}
          >
            {t("calendar.filter.button")}
            {activeDimensions > 0 ? ` (${activeDimensions})` : ""}
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
          masters={masters}
          viabilityByDate={viabilityByDate}
          activeCampaignIds={activeCampaignIds}
          activeMasterIds={activeMasterIds}
          activeViabilities={activeViabilities}
          currentUserId={currentUserId}
        />
      </div>

      {filtersOpen ? (
        <FiltersModal
          title={t("calendar.filter.title")}
          onClose={() => setFiltersOpen(false)}
        >
          <CalendarFilters
            campaigns={campaigns}
            masters={masters}
            activeCampaignIds={activeCampaignIds}
            activeMasterIds={activeMasterIds}
            activeViabilities={activeViabilities}
            onChangeCampaigns={(next) => persist({ campaignIds: next })}
            onChangeMasters={(next) => persist({ masterIds: next })}
            onToggleViability={toggleViability}
            onClear={clearFilters}
          />
        </FiltersModal>
      ) : null}
    </>
  );
}
