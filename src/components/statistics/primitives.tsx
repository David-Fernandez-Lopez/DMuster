import type { ReactNode } from "react";

import { campaignColor, campaignTint } from "@/lib/campaignColor";

/**
 * Two-letter campaign chip (tag), a pill tinted with the campaign's own colour.
 * Not hidden from assistive tech: in the charts the tag is the row's only label.
 *
 * @param {{ tag: string; colorSlot: number; size?: "sm" | "md" }} props - The tag, the
 *   campaign's palette slot and the size.
 * @returns {JSX.Element}
 */
export function CampaignChip({
  tag,
  colorSlot,
  size = "sm",
}: {
  tag: string;
  colorSlot: number;
  size?: "sm" | "md";
}) {
  return (
    <span
      style={{ background: campaignTint(colorSlot), borderColor: campaignColor(colorSlot) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] font-extrabold uppercase text-ink ${
        size === "md" ? "px-[10px] py-0.5 text-xs" : "min-w-[30px] px-2 text-[10px]"
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
 * Horizontal bar: soft track, brand fill (or the given colours).
 *
 * @param {object} props - Component props.
 * @param {number} props.percent - Fill width, 0..100.
 * @param {number} [props.height] - Track height in px.
 * @param {string} [props.fill] - CSS colour of the fill (default brand).
 * @param {string} [props.track] - Track colour class.
 * @param {string} [props.trackColor] - CSS colour of the track; replaces `track` when given.
 * @returns {JSX.Element}
 */
export function HBar({
  percent,
  height = 10,
  fill = "var(--color-brand)",
  track = "bg-brand-soft",
  trackColor,
}: {
  percent: number;
  height?: number;
  fill?: string;
  track?: string;
  trackColor?: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ height, ...(trackColor ? { background: trackColor } : {}) }}
      className={`overflow-hidden rounded-full ${trackColor ? "" : track}`}
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

/**
 * Chip with a person's initial and a count ("Adri · 1").
 *
 * @param {{ name: string; count: number }} props - The person and the count.
 * @returns {JSX.Element}
 */
export function PersonChip({ name, count }: { name: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border bg-bg py-[3px] pl-[3px] pr-[10px] text-xs font-semibold">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[10px] font-extrabold uppercase text-brand"
      >
        {name[0]}
      </span>
      {name} · {count}
    </span>
  );
}
