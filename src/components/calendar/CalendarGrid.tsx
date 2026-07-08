import type { ReactNode } from "react";

import DayCell from "@/components/calendar/DayCell";
import { isEligible, toUtcDate } from "@/lib/date";

type CalendarGridProps = {
  /** The visible month, "YYYY-MM". */
  month: string;
  /** Monday-first grid days from `monthGridDays(month)`. */
  days: string[];
  /** Holiday dates as "YYYY-MM-DD" strings, for eligibility. */
  holidays: Set<string>;
  /** Today's date, "YYYY-MM-DD", for the today ring. */
  today: string;
  /** Active locale for localized weekday headers. */
  locale: string;
  /** Optional per-day viability chips injected by roadmap #18. */
  renderIndicators?: (iso: string) => ReactNode;
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
 * day cells. Weekday names come from `Intl` (no i18n keys). Cells are separated
 * by 1px gaps over the border color for the sheet-style line effect. Eligibility
 * and the today ring are computed per cell from `src/lib/date.ts`.
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
  renderIndicators,
}: CalendarGridProps) {
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });

  // The first row of the grid is always Monday–Sunday; format those seven days.
  const weekdayHeaders = days
    .slice(0, 7)
    .map((iso) => capitalize(weekdayFormatter.format(toUtcDate(iso))));

  return (
    <div className="grid grid-cols-7 gap-px border border-border bg-border">
      {weekdayHeaders.map((label, index) => (
        <div
          key={index}
          className="bg-bg-elevated py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          {label}
        </div>
      ))}
      {days.map((iso) => (
        <DayCell
          key={iso}
          iso={iso}
          eligible={isEligible(iso, holidays)}
          today={iso === today}
          outOfMonth={!iso.startsWith(month)}
          indicators={renderIndicators?.(iso)}
        />
      ))}
    </div>
  );
}
