import type { ReactNode } from "react";

/**
 * The card primitive of the statistics screens: elevated surface, 1px border,
 * radius 14, padding 14, no shadow. `wide` takes a whole row of a `CardGrid`.
 *
 * @param {object} props - Component props.
 * @param {ReactNode} props.children - Card content.
 * @param {boolean} [props.wide] - Span the whole grid row.
 * @returns {JSX.Element}
 */
export default function StatCard({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border bg-bg-elevated p-[14px] ${
        wide ? "basis-full!" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Small uppercase label that titles a card.
 *
 * @param {{ children: ReactNode }} props - The label text.
 * @returns {JSX.Element}
 */
export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
      {children}
    </span>
  );
}

/**
 * The responsive card layout: one column on mobile, up to three on desktop.
 * It wraps instead of using a fixed grid, and every card grows, so the last row
 * stretches to the full width of the page instead of leaving empty slots
 * (eight cards read 3 + 3 + 2, the two of the last row taking half each). A
 * `wide` card takes a whole row.
 *
 * @param {{ children: ReactNode }} props - The cards.
 * @returns {JSX.Element}
 */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-[10px] [&>*]:min-w-0 [&>*]:grow [&>*]:basis-[300px]">
      {children}
    </div>
  );
}
