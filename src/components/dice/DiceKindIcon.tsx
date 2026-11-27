import type { DiceEventKind } from "@/generated/prisma/enums";

/**
 * Glyphs per kind, drawn as strokes on a 24×24 grid: a four-pointed star for a
 * critical and a broken bolt for a fumble. Different silhouettes, so the two
 * stay apart without relying on colour.
 */
const GLYPHS: Record<DiceEventKind, React.ReactNode> = {
  CRITICAL: <path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z" />,
  FUMBLE: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
};

interface DiceKindIconProps {
  /** Which kind to draw. */
  kind: DiceEventKind;
  /** Size utilities (the stroke follows `currentColor`). */
  className?: string;
}

/**
 * Small decorative icon for a critical or a fumble. Always sits next to the
 * kind's name, so it is hidden from assistive technology.
 *
 * @param {DiceKindIconProps} props
 * @returns {JSX.Element}
 */
export default function DiceKindIcon({ kind, className = "h-4 w-4" }: DiceKindIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {GLYPHS[kind]}
    </svg>
  );
}
