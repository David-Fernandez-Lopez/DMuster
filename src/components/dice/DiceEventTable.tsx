import type { TFunction } from "i18next";

import CampaignBadge from "@/components/campaigns/CampaignBadge";
import DiceEventCell from "@/components/dice/DiceEventCell";
import DiceKindIcon from "@/components/dice/DiceKindIcon";
import type { DiceEventCampaignContext, DiceEventRow } from "@/lib/diceEventService";
import { toUtcDate } from "@/lib/date";
import { buildDiceEventTable } from "@/lib/diceEventTable";
import { skillLabel } from "@/lib/diceSkillLabel";
import type { DiceEventKind } from "@/generated/prisma/enums";

/**
 * The handoff's hatched fill (same family as its "cancelled" pattern), used
 * behind the fumble headers. The lines are `ink-muted` mixed 30 % into the
 * background instead of at full strength: at full strength they were bright
 * enough in dark mode to swallow the total printed over them.
 */
const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-ink-muted) 30%, var(--color-brand-soft)) 0 1px, var(--color-brand-soft) 1px 5px)";

interface DiceEventTableProps {
  /** The campaign shown. */
  campaign: DiceEventCampaignContext;
  /** Its entries, oldest first (the whole filtered set, not a page). */
  rows: DiceEventRow[];
  /** Active player/kind filters. */
  filters: { userId?: string; kind?: DiceEventKind };
  viewerId: string;
  /** "YYYY-MM-DD" of today. */
  today: string;
  t: TFunction;
  locale: string;
}

/**
 * The log laid out like the Excel it replaces, in the statistics handoff's
 * card style: a column pair (Crítico | Pifia) per player with the totals up
 * top, one row per entry below, and one block per arc when the campaign has
 * arcs. The two kinds differ by icon, text and fill (plain soft header vs
 * hatched), never by the S/N state colours. Scrolls sideways on narrow screens.
 * Each skill is a button that opens its detail.
 *
 * @param {DiceEventTableProps} props
 * @returns {JSX.Element}
 */
export default function DiceEventTable({ campaign, rows, filters, viewerId, today, t, locale }: DiceEventTableProps) {
  const table = buildDiceEventTable(rows, campaign, filters);
  const dateTime = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const arcName = (arc: { number: number; name: string | null }) =>
    arc.name
      ? t("diceEvents.arcLabelNamed", { number: arc.number, name: arc.name })
      : t("diceEvents.arcLabel", { number: arc.number });
  const colsPerPlayer = table.kinds.length;

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-bg-elevated p-3.5">
      <div className="mb-3 flex items-center gap-2.5">
        <CampaignBadge tag={campaign.tag} colorSlot={campaign.colorSlot} />
        <h2 className="min-w-0 truncate font-display text-[17px] font-semibold text-ink">{campaign.name}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{`${campaign.name}: ${t("diceEvents.title")}`}</caption>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column.userId}
                  scope="colgroup"
                  colSpan={colsPerPlayer}
                  className="border-l border-border px-2 pb-1.5 text-center first:border-l-0"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[11px] font-extrabold uppercase text-brand"
                    >
                      {column.name.charAt(0)}
                    </span>
                    <span className="text-[13px] font-bold text-ink">{column.name}</span>
                    {column.isDm ? (
                      <span className="text-[11px] font-bold text-brand">· {t("campaigns.role.DM")}</span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {table.columns.flatMap((column) =>
                table.kinds.map((kind, index) => (
                  <th
                    key={`${column.userId}-${kind}`}
                    scope="col"
                    className={`min-w-[104px] px-1 pb-2 ${index === 0 ? "border-l border-border first:border-l-0" : ""}`}
                  >
                    <span
                      className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-1.5 py-1"
                      style={kind === "FUMBLE" ? { backgroundImage: HATCH } : { background: "var(--color-brand-soft)" }}
                    >
                      <span className="inline-flex items-center gap-1 rounded bg-bg-elevated px-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-brand">
                        <DiceKindIcon kind={kind} className="h-3 w-3" />
                        {t(`diceEvents.kind.${kind}`)}
                      </span>
                      <b className="font-display text-base text-ink">
                        {kind === "CRITICAL" ? column.critical : column.fumble}
                      </b>
                    </span>
                  </th>
                )),
              )}
            </tr>
          </thead>

          {table.sections.map((section) => (
            <tbody key={section.arc?.id ?? "no-arc"}>
              {campaign.arcs.length > 0 ? (
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={table.columns.length * colsPerPlayer}
                    className="px-2 pb-1 pt-3 text-left text-[11px] font-bold uppercase tracking-[.06em] text-ink-muted"
                  >
                    {section.arc ? arcName(section.arc) : t("diceEvents.form.noArc")}
                  </th>
                </tr>
              ) : null}
              {Array.from({ length: section.height }, (_, rowIndex) => (
                <tr key={rowIndex}>
                  {table.columns.flatMap((column) =>
                    table.kinds.map((kind, index) => {
                      const entry = section.cells.get(column.userId)?.[kind === "CRITICAL" ? "critical" : "fumble"][rowIndex];
                      return (
                        <td
                          key={`${column.userId}-${kind}`}
                          className={`border-t border-border px-1 py-0.5 align-top ${index === 0 ? "border-l first:border-l-0" : ""}`}
                        >
                          {entry ? (
                            <DiceEventCell
                              entry={entry}
                              label={skillLabel(entry.skill, entry.detail, locale)}
                              campaign={campaign}
                              viewerId={viewerId}
                              today={today}
                              whenLabel={`${dateTime.format(toUtcDate(entry.date))}${entry.time ? ` · ${entry.time}` : ""}`}
                              arcLabel={entry.arc ? arcName(entry.arc) : null}
                            />
                          ) : null}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
