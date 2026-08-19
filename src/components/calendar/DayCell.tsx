import type { Viability } from "@/lib/viability";

/** A per-campaign viability chip for a day cell. */
export type DayIndicator = {
  campaignId: string;
  tag: string;
  name: string;
  viability: Viability;
  /** Whether this campaign has an active confirmed session on this day (roadmap #21). */
  confirmed: boolean;
};

/** Dot color per viability tier (S→green, N→red, T→amber). */
const DOT_CLASS: Record<Viability, string> = {
  S: "bg-s",
  N: "bg-n",
  T: "bg-t",
};

/**
 * Non-confirmed chips shown on mobile before the rest collapse into the "+N"
 * chip. Confirmed sessions are exempt from this cap — they always render in
 * full, each on its own row — so it only ever counts pending indicators.
 * Exported so `CalendarGrid` computes the matching "+N" count from the same
 * number instead of redeclaring it.
 */
export const MOBILE_MAX_CHIPS = 6;

/**
 * Small checkmark badge marking a confirmed session's chip, shared by the
 * mobile (tag + icon) and desktop (full name + icon) confirmed renderings.
 *
 * @param {{ className?: string }} props
 * @returns {JSX.Element}
 */
function ConfirmedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
 * is marked with a brand ring. An eligible day with at least one active
 * confirmed session (roadmap #21) tints the **whole cell** `bg-brand-soft`
 * instead of the plain `bg-bg-elevated` — the same "confirmed" token used by
 * the day modal's confirmed-session card — so a confirmed day is obvious at a
 * glance across the month, not just from its own chip.
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
 * A campaign with an active confirmed session (roadmap #21) renders
 * differently and always in full, exempt from the mobile cap and the "+N"
 * count (never hidden behind an overflow): the day number's own size and
 * weight (`text-sm font-bold`), so it reads at a glance over the dimmer
 * viability dots. On mobile it spans the full row (`col-span-2`) showing the
 * 2-letter tag plus a checkmark icon; on desktop it spans the full row
 * (`col-span-3`) showing the checkmark plus the **full campaign name**
 * (truncated). Confirmed chips are sorted first by the grid and rendered
 * ahead of the (capped) pending ones in both layouts.
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

  const confirmed = indicators?.filter((indicator) => indicator.confirmed) ?? [];
  const pending = indicators?.filter((indicator) => !indicator.confirmed) ?? [];
  const hasConfirmedSession = confirmed.length > 0;

  const base = "min-h-[56px] p-1 md:min-h-[110px] md:p-2";
  const state = eligible
    ? hasConfirmedSession
      ? "bg-brand-soft"
      : "bg-bg-elevated"
    : "bg-bg opacity-45 pointer-events-none";
  const dimmed = outOfMonth ? "opacity-30" : "";
  const ring = today ? "border-2 border-brand" : "";
  const className = `${base} ${state} ${dimmed} ${ring}`.trim();

  const content = (
    <>
      <span className="text-sm font-semibold text-ink">{dayNumber}</span>
      {indicators && indicators.length > 0 ? (
        <>
          {/* Mobile: every confirmed session first, each spanning its own full
              row so no other campaign's dot shares its height; then the
              pending campaigns as dots only, capped at MOBILE_MAX_CHIPS with
              a "+N" overflow (confirmed sessions never count toward it). */}
          <div className="mt-1 grid grid-cols-2 gap-x-1.5 gap-y-1 md:hidden">
            {confirmed.map((indicator) => (
              <span
                key={indicator.campaignId}
                className="col-span-2 flex items-center gap-1 text-sm font-bold leading-none text-ink"
              >
                <ConfirmedIcon className="h-3.5 w-3.5 shrink-0 text-brand" />
                {indicator.tag}
              </span>
            ))}
            {pending.slice(0, MOBILE_MAX_CHIPS).map((indicator) => (
              <span
                key={indicator.campaignId}
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
          {/* Desktop: every confirmed session spans the full row with its
              full name, at the day number's own size and weight; every
              pending campaign is a dot + tag chip in up to 3 columns. */}
          <div className="mt-1 hidden grid-cols-3 gap-x-1.5 gap-y-0.5 md:grid">
            {confirmed.map((indicator) => (
              <span
                key={indicator.campaignId}
                className="col-span-3 flex min-w-0 items-center gap-1 text-sm font-bold leading-tight text-ink"
              >
                <ConfirmedIcon className="h-3.5 w-3.5 shrink-0 text-brand" />
                <span className="truncate">{indicator.name}</span>
              </span>
            ))}
            {pending.map((indicator) => (
              <span
                key={indicator.campaignId}
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
