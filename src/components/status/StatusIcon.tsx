import type { Viability } from "@/lib/viability";

/** What a status icon can show: a viability tier, or "NONE" for an unanswered day. */
export type StatusKind = Viability | "NONE";

/**
 * SVG paths per status, drawn as 2px strokes on a 24×24 grid. Each glyph has a
 * different silhouette (tick, screen, question mark, cross, hourglass, dashed
 * ring), so the states stay apart without relying on colour at all.
 */
const GLYPHS: Record<StatusKind, React.ReactNode> = {
  S: <path d="M5 13l4 4L19 7" />,
  O: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  T: (
    <>
      <path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
      <path d="M12 18h.01" />
    </>
  ),
  N: <path d="M6 6l12 12M18 6L6 18" />,
  B: <path d="M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3" />,
  NONE: <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />,
};

/** Text colour class per viability tier (the icon takes `currentColor`). */
export const STATUS_TEXT_CLASS: Record<Viability, string> = {
  S: "text-s",
  O: "text-o",
  N: "text-n",
  T: "text-t",
  B: "text-b",
};

interface StatusIconProps {
  /** The status to draw. */
  kind: StatusKind;
  /** Size and colour utilities (the stroke follows `currentColor`). */
  className?: string;
  /**
   * Accessible name. Omit it when the icon sits next to text that already says
   * the same (it is then hidden from assistive technology).
   */
  label?: string;
}

/**
 * Small icon for a viability tier or an answer, so a state never depends on
 * its colour alone (colour-blind players, roadmap: accessibility epic).
 *
 * @param {StatusIconProps} props
 * @returns {JSX.Element}
 */
export default function StatusIcon({ kind, className = "h-4 w-4", label }: StatusIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {GLYPHS[kind]}
    </svg>
  );
}
