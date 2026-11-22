import type { Rhythm } from "@/lib/statistics/metrics";

import { monthShort } from "./format";
import StatCard, { CardLabel } from "./StatCard";

/**
 * Background of one heat-map cell: nothing past the month's end, a faint tone
 * for non-eligible days, the border tone for eligible ones, and brand tones
 * for one or more sessions.
 *
 * @param {Rhythm["heat"][number]["days"][number] | null} day - The day, or null past the month's end.
 * @returns {string} A CSS colour.
 */
function cellColor(day: Rhythm["heat"][number]["days"][number] | null): string {
  if (!day) return "transparent";
  if (day.count > 1) return "var(--color-brand)";
  if (day.count === 1) {
    return "color-mix(in oklch, var(--color-brand) 58%, var(--color-bg-elevated))";
  }
  if (day.future) {
    return day.eligible
      ? "color-mix(in oklch, var(--color-border) 45%, transparent)"
      : "transparent";
  }
  return day.eligible
    ? "var(--color-border)"
    : "color-mix(in oklch, var(--color-border) 30%, transparent)";
}

interface HeatmapCalendarProps {
  heat: Rhythm["heat"];
  title: string;
  /** Translated legend words: eligible, "1", "2". */
  legend: { eligible: string; one: string; two: string };
  locale: string;
}

/**
 * Heat map of days with a session: one row per month, one cell per day, the
 * month's total on the right.
 *
 * @param {HeatmapCalendarProps} props - The data and translated labels.
 * @returns {JSX.Element}
 */
export default function HeatmapCalendar({ heat, title, legend, locale }: HeatmapCalendarProps) {
  return (
    <StatCard wide>
      <div className="mb-3 flex items-baseline justify-between">
        <CardLabel>{title}</CardLabel>
        <span className="flex items-center gap-[5px] text-[10px] text-ink-muted">
          <span className="h-[9px] w-[9px] rounded-[2px] bg-border" />
          {legend.eligible}
          <span
            className="ml-1.5 h-[9px] w-[9px] rounded-[2px]"
            style={{ background: cellColor({ date: "", count: 1, eligible: true, future: false }) }}
          />
          {legend.one}
          <span className="ml-1.5 h-[9px] w-[9px] rounded-[2px] bg-brand" />
          {legend.two}
        </span>
      </div>
      <div className="flex flex-col gap-[3px]" role="img" aria-label={title}>
        {heat.map((row) => (
          <div
            key={row.month}
            aria-hidden="true"
            className="grid grid-cols-[26px_repeat(31,minmax(0,1fr))_20px] items-center gap-0.5"
          >
            <span className="text-[10px] font-semibold text-ink-muted">
              {monthShort(row.month, locale)}
            </span>
            {Array.from({ length: 31 }, (_, index) => {
              const day = row.days[index] ?? null;
              return (
                <span
                  key={index}
                  className="aspect-square max-h-4 rounded-[2px]"
                  style={{ background: cellColor(day) }}
                />
              );
            })}
            <span className="text-right text-[10px] font-bold">{row.total || ""}</span>
          </div>
        ))}
      </div>
    </StatCard>
  );
}
