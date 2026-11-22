import type { ReactNode } from "react";

/**
 * The card primitive of the statistics screens: elevated surface, 1px border,
 * radius 14, padding 14, no shadow. `wide` spans every column of the grid.
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
        wide ? "col-span-full" : ""
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
 * The responsive grid of cards: one column on mobile, up to three on desktop.
 *
 * @param {{ children: ReactNode }} props - The cards.
 * @returns {JSX.Element}
 */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-[10px]">
      {children}
    </div>
  );
}
