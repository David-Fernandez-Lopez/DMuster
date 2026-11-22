"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { campaignColor } from "@/lib/campaignColor";
import type { Rhythm } from "@/lib/statistics/metrics";

import { monthInitial, monthLabel, monthShort } from "./format";
import StatCard, { CardLabel } from "./StatCard";

/** Height of the bars area, in px. */
const BARS_HEIGHT = 116;

/** Axis shows three-letter months up to this many months, initials beyond. */
const SHORT_AXIS_MAX_MONTHS = 12;

interface MonthlyStackedChartProps {
  months: Rhythm["months"];
  monthMax: number;
  /** Campaigns to list in the legend, in the fixed ramp order. */
  legend: { campaignId: string }[];
  campaigns: Record<string, { tag: string; name: string; colorSlot: number }>;
}

/**
 * Stacked bars of sessions per month, one tone per campaign. Tapping a legend
 * chip highlights that campaign (the rest fade to 18% opacity); tapping it
 * again clears the highlight. The highlight is local state, never persisted.
 *
 * @param {MonthlyStackedChartProps} props - Months, scale, legend and campaign data.
 * @returns {JSX.Element}
 */
export default function MonthlyStackedChart({
  months,
  monthMax,
  legend,
  campaigns,
}: MonthlyStackedChartProps) {
  const { t, i18n } = useTranslation();
  const [highlight, setHighlight] = useState<string | null>(null);
  const locale = i18n.language;
  const short = months.length <= SHORT_AXIS_MAX_MONTHS;

  return (
    <StatCard wide>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardLabel>{t("statistics.rhythm.perMonth")}</CardLabel>
        <span className="text-[11px] text-ink-muted">
          {highlight
            ? t("statistics.rhythm.highlighting", { name: campaigns[highlight]?.name })
            : t("statistics.rhythm.highlightHint")}
        </span>
      </div>

      <div className="flex items-end gap-1" style={{ height: BARS_HEIGHT + 20 }}>
        {months.map((month) => (
          <div
            key={month.key}
            role="img"
            aria-label={t("statistics.rhythm.chartLabel", {
              month: monthLabel(month.key, locale),
              count: month.total,
            })}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
          >
            <div className="mb-0.5 text-center text-[10px] font-bold text-ink-muted">
              {month.total || ""}
            </div>
            <div className="flex flex-col-reverse gap-px">
              {month.segments.map((segment) => {
                const campaign = campaigns[segment.campaignId];
                return (
                  <div
                    key={segment.campaignId}
                    style={{
                      height: (segment.n / monthMax) * BARS_HEIGHT,
                      background: campaignColor(campaign?.colorSlot ?? 0),
                      opacity: highlight && highlight !== segment.campaignId ? 0.18 : 1,
                    }}
                    className="rounded-[2px] transition-opacity"
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="mt-1.5 flex gap-1 border-t border-border pt-[5px]">
        {months.map((month) => (
          <div
            key={month.key}
            className="min-w-0 flex-1 text-center text-[10px] font-semibold text-ink-muted"
          >
            {short ? monthShort(month.key, locale) : monthInitial(month.key, locale)}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {legend.map(({ campaignId }) => {
          const campaign = campaigns[campaignId];
          const active = highlight === campaignId;
          return (
            <button
              key={campaignId}
              type="button"
              aria-pressed={active}
              onClick={() => setHighlight(active ? null : campaignId)}
              style={{ opacity: highlight && !active ? 0.55 : 1 }}
              className={`flex items-center gap-[5px] rounded-full border bg-bg py-[3px] pl-[5px] pr-[9px] text-[11px] font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active ? "border-brand" : "border-border"
              }`}
            >
              <span
                aria-hidden="true"
                style={{ background: campaignColor(campaign?.colorSlot ?? 0) }}
                className="h-3 w-3 rounded-full"
              />
              {campaign?.tag}
            </button>
          );
        })}
      </div>
    </StatCard>
  );
}
