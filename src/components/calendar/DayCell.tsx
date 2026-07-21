import type { Viability } from "@/lib/viability";

/** A per-campaign viability chip for a day cell. */
export type DayIndicator = { tag: string; viability: Viability };

/** Dot color per viability tier (S→green, N→red, T→amber). */
const DOT_CLASS: Record<Viability, string> = {
  S: "bg-s",
  N: "bg-n",
  T: "bg-t",
};

/** Chips shown on mobile before the rest collapse into the "+N" chip. */
const MOBILE_MAX_CHIPS = 6;

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
  /** Per-campaign viability chips (already filtered and ordered by the grid). */
  indicators?: DayIndicator[];
  /** Mobile-only "+N" label for chips past the cap; `null` when none overflow. */
  moreLabel?: string | null;
};

/**
 * A single calendar day cell. Eligible days are elevated and, when tapped, open
 * the day availability modal via `onSelect`; non-eligible days are dimmed and
 * inert. Out-of-month days are dimmed further on top of either state, and today
 * is marked with a brand ring.
 *
 * On eligible days it renders the per-campaign viability chips (a colored dot
 * plus the 2-letter tag) in a compact column grid — up to 3 columns on desktop
 * and 2 on mobile, where the tag is hidden so only the dots show — to use the
 * cell's width instead of a single tall list. Two sibling containers are toggled
 * with the canonical `md:hidden` / `hidden md:grid` pattern (never a per-item
 * display override): a **mobile** grid of dots only, capped at `MOBILE_MAX_CHIPS`
 * with a "+N" overflow chip (`moreLabel`), and a **desktop** grid showing every
 * campaign as a dot + tag chip in up to 3 columns.
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
  moreLabel,
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
      {indicators && indicators.length > 0 ? (
        <>
          {/* Mobile: dots only, capped at MOBILE_MAX_CHIPS with a "+N" overflow. */}
          <div className="mt-1 grid grid-cols-2 gap-x-1.5 gap-y-1 md:hidden">
            {indicators.slice(0, MOBILE_MAX_CHIPS).map((indicator) => (
              <span
                key={indicator.tag}
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${DOT_CLASS[indicator.viability]}`}
              />
            ))}
            {moreLabel ? (
              <span className="text-[10px] font-semibold leading-none text-ink-muted">
                {moreLabel}
              </span>
            ) : null}
          </div>
          {/* Desktop: every campaign as a dot + tag chip, in up to 3 columns. */}
          <div className="mt-1 hidden grid-cols-3 gap-x-1.5 gap-y-0.5 md:grid">
            {indicators.map((indicator) => (
              <span
                key={indicator.tag}
                className="flex items-center gap-1 text-[10px] font-semibold leading-tight text-ink-muted"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[indicator.viability]}`}
                />
                {indicator.tag}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </>
  );

  if (eligible) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(iso)}
        aria-haspopup="dialog"
        className={`flex w-full cursor-pointer flex-col text-left ${className}`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
