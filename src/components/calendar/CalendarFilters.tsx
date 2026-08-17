"use client";

import { useTranslation } from "react-i18next";

import MultiSelectFilter from "@/components/calendar/MultiSelectFilter";
import { ALL_VIABILITIES } from "@/lib/calendarFilterStorage";
import type {
  CalendarCampaign,
  CalendarMaster,
} from "@/lib/calendarService";
import type { Viability } from "@/lib/viability";

/** Vellum status-chip variant per viability tier for the availability toggles. */
const VIABILITY_CHIP_CLASS: Record<Viability, string> = {
  S: "btn-yes",
  T: "btn-maybe",
  N: "btn-no",
};

interface CalendarFiltersProps {
  /** The user's campaigns, sorted by name. */
  campaigns: CalendarCampaign[];
  /** The distinct DMs across those campaigns, sorted by name. */
  masters: CalendarMaster[];
  /** Selected campaign ids (shown). */
  activeCampaignIds: Set<string>;
  /** Selected master userIds (shown). */
  activeMasterIds: Set<string>;
  /** Selected viability tiers (shown). */
  activeViabilities: Set<Viability>;
  /** Receives the full next campaign selection. */
  onChangeCampaigns: (next: Set<string>) => void;
  /** Receives the full next master selection. */
  onChangeMasters: (next: Set<string>) => void;
  /** Toggles a viability tier. */
  onToggleViability: (viability: Viability) => void;
  /** Resets every dimension to "all shown" (no filter). */
  onClear: () => void;
}

/**
 * The body of the calendar filters modal: three dimensions that narrow which
 * per-campaign chips the grid shows. Campaigns and Masters are dropdown
 * multi-selects (`MultiSelectFilter`); Availability is a row of viability-tinted
 * toggle chips (Sí / Tal vez / No → tiers S / T / N). All selected in a
 * dimension means it is off; the three combine with AND upstream in
 * `CalendarGrid`. A "Clear filters" action resets everything.
 *
 * @param {CalendarFiltersProps} props
 * @returns {JSX.Element}
 */
export default function CalendarFilters({
  campaigns,
  masters,
  activeCampaignIds,
  activeMasterIds,
  activeViabilities,
  onChangeCampaigns,
  onChangeMasters,
  onToggleViability,
  onClear,
}: CalendarFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <MultiSelectFilter
        title={t("calendar.filter.campaigns")}
        options={campaigns.map((campaign) => ({
          id: campaign.id,
          chip: campaign.tag,
          label: campaign.name,
        }))}
        selectedIds={activeCampaignIds}
        onChange={onChangeCampaigns}
      />

      <MultiSelectFilter
        title={t("calendar.filter.masters")}
        options={masters.map((master) => ({
          id: master.userId,
          chip: master.name,
          label: master.name,
        }))}
        selectedIds={activeMasterIds}
        onChange={onChangeMasters}
      />

      <div>
        <span className="mb-1 block font-display text-sm font-semibold text-ink">
          {t("calendar.filter.availability")}
        </span>
        <div
          role="group"
          aria-label={t("calendar.filter.availability")}
          className="grid grid-cols-3 gap-2"
        >
          {ALL_VIABILITIES.map((viability) => {
            const isActive = activeViabilities.has(viability);
            return (
              <button
                key={viability}
                type="button"
                onClick={() => onToggleViability(viability)}
                aria-pressed={isActive}
                className={`btn ${VIABILITY_CHIP_CLASS[viability]} min-h-[44px] px-4 text-sm font-semibold ${
                  isActive ? "" : "opacity-60 hover:opacity-100"
                }`}
              >
                {t(`calendar.viability.${viability}`)}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onClear}
        className="btn btn-secondary min-h-[44px] px-4 text-sm font-semibold"
      >
        {t("calendar.filter.clear")}
      </button>
    </div>
  );
}
