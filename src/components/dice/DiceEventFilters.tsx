"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import type { DiceEventCampaignContext } from "@/lib/diceEventService";

interface DiceEventFiltersProps {
  /** Campaigns the viewer belongs to. */
  campaigns: DiceEventCampaignContext[];
  /** When set, the page is scoped to this campaign and its select is hidden. */
  scopedCampaignId?: string;
}

/**
 * Filter selects of the log (campaign, player, type, arc). Each change rewrites
 * the query string and goes back to page 1, so the server component re-renders
 * with the new filters and the URL stays shareable. The arc select appears once
 * a single campaign is in play, since arcs belong to one.
 *
 * @param {DiceEventFiltersProps} props
 * @returns {JSX.Element}
 */
export default function DiceEventFilters({ campaigns, scopedCampaignId }: DiceEventFiltersProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const campaignId = scopedCampaignId ?? params.get("campaignId") ?? "";
  const userId = params.get("userId") ?? "";
  const kind = params.get("kind") ?? "";
  const arcId = params.get("arcId") ?? "";

  const inScope = campaigns.filter((c) => !campaignId || c.id === campaignId);
  const selected = campaigns.find((c) => c.id === campaignId);
  const players = [
    ...new Map(inScope.flatMap((c) => c.members).map((m) => [m.userId, m.name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const hasFilters = Boolean(userId || kind || arcId || (!scopedCampaignId && campaignId));

  /**
   * Sets (or clears, on an empty value) one filter and navigates. Changing the
   * campaign drops the arc, which belongs to the previous one.
   *
   * @param {string} key - Query parameter to change.
   * @param {string} value - New value; empty removes the parameter.
   */
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key === "campaignId") {
      next.delete("arcId");
    }
    next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const selectClass =
    "min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink";

  return (
    <div className="flex flex-wrap items-end gap-3" role="search" aria-label={t("diceEvents.filters.title")}>
      {scopedCampaignId ? null : (
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          {t("diceEvents.filters.campaign")}
          <select value={campaignId} onChange={(e) => update("campaignId", e.target.value)} className={selectClass}>
            <option value="">{t("diceEvents.filters.all")}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        {t("diceEvents.filters.player")}
        <select value={userId} onChange={(e) => update("userId", e.target.value)} className={selectClass}>
          <option value="">{t("diceEvents.filters.all")}</option>
          {players.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        {t("diceEvents.filters.kind")}
        <select value={kind} onChange={(e) => update("kind", e.target.value)} className={selectClass}>
          <option value="">{t("diceEvents.filters.all")}</option>
          <option value="CRITICAL">{t("diceEvents.kind.CRITICAL")}</option>
          <option value="FUMBLE">{t("diceEvents.kind.FUMBLE")}</option>
        </select>
      </label>
      {selected && selected.arcs.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          {t("diceEvents.filters.arc")}
          <select value={arcId} onChange={(e) => update("arcId", e.target.value)} className={selectClass}>
            <option value="">{t("diceEvents.filters.all")}</option>
            {selected.arcs.map((arc) => (
              <option key={arc.id} value={arc.id}>
                {arc.name
                  ? t("diceEvents.arcLabelNamed", { number: arc.number, name: arc.name })
                  : t("diceEvents.arcLabel", { number: arc.number })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {hasFilters ? (
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold"
        >
          {t("diceEvents.filters.clear")}
        </button>
      ) : null}
    </div>
  );
}
