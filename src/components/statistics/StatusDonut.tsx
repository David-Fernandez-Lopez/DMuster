import type { AnswerSplit } from "@/lib/statistics/metrics";

/** Order of the segments, clockwise from the top: S → O → T → N. */
const ORDER = ["S", "O", "T", "N"] as const;

/**
 * Builds the `conic-gradient` of an answer split: S, O, T and N accumulate
 * clockwise and the rest (days without a share, e.g. rounding) stays on the
 * border tone.
 *
 * @param {AnswerSplit} counts - Days per state.
 * @param {number} eligible - Eligible days (the whole circle).
 * @returns {string} A CSS `conic-gradient(...)` value.
 */
export function donutGradient(counts: AnswerSplit, eligible: number): string {
  if (eligible === 0) {
    return "conic-gradient(var(--color-border) 0 100%)";
  }
  let from = 0;
  const stops = ORDER.map((state) => {
    const to = from + (counts[state] / eligible) * 100;
    const stop = `var(--color-${state.toLowerCase()}) ${from}% ${to}%`;
    from = to;
    return stop;
  });
  return `conic-gradient(${[...stops, `var(--color-border) ${from}% 100%`].join(", ")})`;
}

interface StatusDonutProps {
  counts: AnswerSplit;
  eligible: number;
  /** Share of eligible days answered, 0..100. */
  rate: number;
  /** Translated "responde". */
  caption: string;
  /** Outer diameter in px: 76 for a member, 84 on the "Yo" tab. */
  size?: number;
}

/**
 * Donut of a person's answers over the eligible days, with their response rate
 * in the middle. The state colours appear only here and in other answer splits.
 *
 * @param {StatusDonutProps} props - The split, rate and caption.
 * @returns {JSX.Element}
 */
export default function StatusDonut({
  counts,
  eligible,
  rate,
  caption,
  size = 76,
}: StatusDonutProps) {
  const inner = size - 20;
  return (
    <div
      role="img"
      aria-label={`${rate}% ${caption}`}
      style={{ width: size, height: size, background: donutGradient(counts, eligible) }}
      className="flex shrink-0 items-center justify-center rounded-full"
    >
      <div
        aria-hidden="true"
        style={{ width: inner, height: inner }}
        className="flex flex-col items-center justify-center rounded-full bg-bg-elevated"
      >
        <span className="text-[15px] font-extrabold leading-none">{rate}%</span>
        <span className="text-[9px] font-bold text-ink-muted">{caption}</span>
      </div>
    </div>
  );
}
