import type { ReactNode } from "react";

type DayCellProps = {
  /** The cell's calendar day, "YYYY-MM-DD". */
  iso: string;
  /** Whether the day is playable (weekend or holiday) — interactive if so. */
  eligible: boolean;
  /** Whether the day is today (drawn with a brand-colored ring). */
  today: boolean;
  /** Whether the day belongs to an adjacent month (dimmed further). */
  outOfMonth: boolean;
  /** Called with the day's ISO when an eligible cell is tapped (opens the modal). */
  onSelect?: (iso: string) => void;
  /** Per-campaign viability chips injected by roadmap #18; absent for now. */
  indicators?: ReactNode;
};

/**
 * A single calendar day cell. Eligible days are elevated and, when tapped, open
 * the day availability modal via `onSelect`; non-eligible days are dimmed and
 * inert. Out-of-month days are dimmed further on top of either state, and today
 * is marked with a brand ring. The optional `indicators` slot lets a later step
 * render viability chips without touching this component.
 *
 * @param {DayCellProps} props
 * @returns {JSX.Element}
 */
export default function DayCell({
  iso,
  eligible,
  today,
  outOfMonth,
  onSelect,
  indicators,
}: DayCellProps) {
  const dayNumber = Number(iso.slice(8));

  const base = "min-h-[56px] p-1 md:min-h-[110px] md:p-2";
  const state = eligible
    ? "bg-bg-elevated"
    : "bg-bg opacity-45 pointer-events-none";
  const dimmed = outOfMonth ? "opacity-30" : "";
  const ring = today ? "border-2 border-brand" : "";
  const className = `${base} ${state} ${dimmed} ${ring}`.trim();

  const content = (
    <>
      <span className="text-sm font-semibold text-ink">{dayNumber}</span>
      {indicators ? <div className="mt-1">{indicators}</div> : null}
    </>
  );

  if (eligible) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(iso)}
        aria-haspopup="dialog"
        className={`block w-full cursor-pointer text-left ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
