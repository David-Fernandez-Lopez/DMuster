"use client";

import { useState } from "react";

import type { ResponseStatus } from "@/components/availability/AvailabilityToggle";
import DayAvailabilityModal from "@/components/calendar/DayAvailabilityModal";
import DayCell from "@/components/calendar/DayCell";
import { isEligible, toUtcDate } from "@/lib/date";

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
 * This is the calendar's client boundary: tapping an eligible day opens the
 * availability modal (no navigation). It holds a live `responses` map so a day
 * reopened after a change shows the fresh status without a refetch. The parent
 * must remount it per month (`key={month}`) so the state does not carry across
 * `?month=` navigations.
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
}: CalendarGridProps) {
  const holidaySet = new Set(holidays);
  const [selected, setSelected] = useState<string | null>(null);
  const [responses, setResponses] =
    useState<Record<string, "YES" | "NO" | "MAYBE">>(initialResponses);

  /**
   * Reconciles the live responses map after the modal persists a change: a
   * YES/NO/MAYBE records the day; clearing (`null`) drops it.
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
  }

  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });

  // The first row of the grid is always Monday–Sunday; format those seven days.
  const weekdayHeaders = days
    .slice(0, 7)
    .map((iso) => capitalize(weekdayFormatter.format(toUtcDate(iso))));

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
        {days.map((iso) => (
          <DayCell
            key={iso}
            iso={iso}
            eligible={isEligible(iso, holidaySet)}
            today={iso === today}
            outOfMonth={!iso.startsWith(month)}
            onSelect={setSelected}
          />
        ))}
      </div>

      {selected !== null ? (
        <DayAvailabilityModal
          date={selected}
          tags={tags}
          initialStatus={responses[selected] ?? null}
          onPersisted={handlePersisted}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
