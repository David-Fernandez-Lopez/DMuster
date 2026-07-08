import Link from "next/link";

import { addMonths, toUtcDate } from "@/lib/date";

type MonthNavProps = {
  /** The visible month, "YYYY-MM". */
  month: string;
  /** The current (today's) month, "YYYY-MM", to gate the "today" shortcut. */
  currentMonth: string;
  /** Active locale for the month/year label. */
  locale: string;
  /** Accessible label for the previous-month arrow. */
  prevLabel: string;
  /** Accessible label for the next-month arrow. */
  nextLabel: string;
  /** Label for the "jump to current month" shortcut. */
  todayLabel: string;
};

/**
 * Month selector: `‹ Mes Año ›` with a shortcut back to the current month.
 * Navigation is via the `?month=YYYY-MM` search param (SSR, shareable). The
 * "today" shortcut links to `/` with no param so the page falls back to the
 * current month; it stays reserved (invisible) while already on that month so
 * the row does not shift.
 *
 * @param {MonthNavProps} props
 * @returns {JSX.Element}
 */
export default function MonthNav({
  month,
  currentMonth,
  locale,
  prevLabel,
  nextLabel,
  todayLabel,
}: MonthNavProps) {
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(`${month}-01`));
  const capitalizedLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const arrowClass =
    "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-control)] border border-border text-ink transition-colors hover:bg-brand-soft";

  return (
    <div className="flex items-center justify-center gap-3">
      <Link
        href={`/?month=${addMonths(month, -1)}`}
        aria-label={prevLabel}
        className={arrowClass}
      >
        ‹
      </Link>
      <span className="min-w-[10rem] text-center font-display text-lg font-semibold text-ink">
        {capitalizedLabel}
      </span>
      <Link
        href={`/?month=${addMonths(month, 1)}`}
        aria-label={nextLabel}
        className={arrowClass}
      >
        ›
      </Link>
      <Link
        href="/"
        className={`flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-soft ${
          month === currentMonth ? "invisible" : ""
        }`}
        aria-hidden={month === currentMonth}
        tabIndex={month === currentMonth ? -1 : undefined}
      >
        {todayLabel}
      </Link>
    </div>
  );
}
