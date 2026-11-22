import type { TFunction } from "i18next";

import type { Rhythm } from "@/lib/statistics/metrics";

import { monthInitial, monthLabel, monthShort } from "./format";
import StatCard, { CardLabel } from "./StatCard";

/** Height of the bars area, in px. */
const BARS_HEIGHT = 90;

/** Axis shows three-letter months up to this many months, initials beyond. */
const SHORT_AXIS_MAX_MONTHS = 12;

interface SimpleMonthlyBarsProps {
  months: Rhythm["months"];
  monthMax: number;
  title: string;
  /** Text at the top right (e.g. "cada 18 días"). */
  aside?: string;
  t: TFunction;
  locale: string;
}

/**
 * Single-colour bars of sessions per month, for one campaign.
 *
 * @param {SimpleMonthlyBarsProps} props - Months, scale and labels.
 * @returns {JSX.Element}
 */
export default function SimpleMonthlyBars({
  months,
  monthMax,
  title,
  aside,
  t,
  locale,
}: SimpleMonthlyBarsProps) {
  const short = months.length <= SHORT_AXIS_MAX_MONTHS;

  return (
    <StatCard wide>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <CardLabel>{title}</CardLabel>
        {aside ? <span className="text-[11px] text-ink-muted">{aside}</span> : null}
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
            <div
              style={{ height: (month.total / monthMax) * BARS_HEIGHT }}
              className="rounded-[2px] bg-brand"
            />
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
    </StatCard>
  );
}
