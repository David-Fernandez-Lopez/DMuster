import { campaignColor, campaignTint } from "@/lib/campaignColor";

import StatCard, { CardLabel } from "./StatCard";
import { Avatar, TiePill } from "./primitives";

/** One displayed position of a hall-of-fame card. */
export type FameRowView = {
  position: number;
  names: string;
  tie: boolean;
  /** Secondary line, shown only for the winner. */
  detail?: string;
  value: string;
};

interface FameCardProps {
  title: string;
  /** The winner's badge: a round avatar or a campaign-style chip. */
  badge: { kind: "round" | "chip"; text: string; colorSlot?: number };
  rows: FameRowView[];
  note?: string;
  tieLabel: string;
  /** Ordinal formatter, e.g. 2 → "2.º". */
  ordinal: (position: number) => string;
}

/**
 * One hall-of-fame card: the winner row (badge, name, value) and the second and
 * third positions below. Ties share a position and carry an "empate" pill; a
 * tied first place shows "=" in the badge.
 *
 * @param {FameCardProps} props - The card content, already translated.
 * @returns {JSX.Element}
 */
export default function FameCard({
  title,
  badge,
  rows,
  note,
  tieLabel,
  ordinal,
}: FameCardProps) {
  const [top, ...rest] = rows;

  return (
    <StatCard>
      <CardLabel>{title}</CardLabel>
      {top ? (
        <div className="mt-[10px] flex items-center gap-[10px]">
          {badge.kind === "round" ? (
            <Avatar label={badge.text} />
          ) : (
            <span
              aria-hidden="true"
              style={
                badge.colorSlot === undefined
                  ? undefined
                  : {
                      background: campaignTint(badge.colorSlot),
                      borderColor: campaignColor(badge.colorSlot),
                    }
              }
              className={`flex h-6 min-w-[34px] shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-extrabold uppercase ${
                badge.colorSlot === undefined
                  ? "bg-brand-soft text-brand"
                  : "border-[1.5px] text-ink"
              }`}
            >
              {badge.text}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold [text-wrap:pretty]">{top.names}</div>
            {top.tie ? <TiePill label={tieLabel} /> : null}
            {top.detail ? (
              <div className="text-xs text-ink-muted">{top.detail}</div>
            ) : null}
          </div>
          <div className="whitespace-nowrap text-sm font-extrabold text-brand">{top.value}</div>
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div className="mt-[10px] flex flex-col gap-1.5 border-t border-border pt-[10px]">
          {rest.map((row) => (
            <div key={row.position} className="flex items-baseline gap-2 text-[13px]">
              <span className="w-[26px] font-bold text-ink-muted">{ordinal(row.position)}</span>
              <span className="min-w-0 flex-1">
                {row.names}
                {row.tie ? (
                  <span className="ml-1.5">
                    <TiePill label={tieLabel} />
                  </span>
                ) : null}
              </span>
              <span className="whitespace-nowrap font-bold">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {note ? (
        <div className="mt-2 text-[11px] leading-snug text-ink-muted">{note}</div>
      ) : null}
    </StatCard>
  );
}
