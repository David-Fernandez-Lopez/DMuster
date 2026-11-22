import type { ReactNode } from "react";

/**
 * Two-letter campaign chip (tag), brand-soft pill.
 *
 * @param {{ tag: string; size?: "sm" | "md" }} props - The tag and size.
 * @returns {JSX.Element}
 */
export function CampaignChip({
  tag,
  size = "sm",
}: {
  tag: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-extrabold uppercase text-brand ${
        size === "md" ? "px-[10px] py-1 text-xs" : "min-w-[30px] px-2 py-0.5 text-[10px]"
      }`}
    >
      {tag}
    </span>
  );
}

/**
 * Round avatar with an initial (or any short mark such as "=").
 *
 * @param {{ label: string; size?: number }} props - The mark and diameter in px.
 * @returns {JSX.Element}
 */
export function Avatar({ label, size = 34 }: { label: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold uppercase text-brand"
    >
      {label}
    </span>
  );
}

/**
 * The "empate" pill shown next to tied entries.
 *
 * @param {{ label: string }} props - The translated word.
 * @returns {JSX.Element}
 */
export function TiePill({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full border border-brand px-[7px] text-[10px] font-bold text-brand">
      {label}
    </span>
  );
}

/**
 * Horizontal bar: soft track, brand fill.
 *
 * @param {object} props - Component props.
 * @param {number} props.percent - Fill width, 0..100.
 * @param {number} [props.height] - Track height in px.
 * @param {string} [props.fill] - CSS colour of the fill (default brand).
 * @param {string} [props.track] - Track colour class.
 * @returns {JSX.Element}
 */
export function HBar({
  percent,
  height = 10,
  fill = "var(--color-brand)",
  track = "bg-brand-soft",
}: {
  percent: number;
  height?: number;
  fill?: string;
  track?: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ height }}
      className={`overflow-hidden rounded-full ${track}`}
    >
      <div
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: fill }}
        className="h-full rounded-full"
      />
    </div>
  );
}

/**
 * Informative note shown when a period has few sessions (never hides data).
 *
 * @param {{ children: ReactNode }} props - The message.
 * @returns {JSX.Element}
 */
export function FewDataNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-[10px] rounded-[var(--radius-card)] bg-brand-soft px-[14px] py-3 text-[13px] leading-normal">
      <span aria-hidden="true" className="font-extrabold text-brand">
        i
      </span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Section title (h2, Cinzel 17).
 *
 * @param {{ children: ReactNode }} props - The title.
 * @returns {JSX.Element}
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-[10px] font-display text-[17px] font-semibold text-ink">
      {children}
    </h2>
  );
}
