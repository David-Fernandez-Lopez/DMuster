import { CampaignRole } from "@/generated/prisma/enums";
import type { DiceEventKind } from "@/generated/prisma/enums";
import type { DiceEventCampaignContext, DiceEventRow } from "@/lib/diceEventService";

/** One player's pair of columns (Crítico | Pifia), with the totals shown above them. */
export type DiceTableColumn = {
  userId: string;
  name: string;
  isDm: boolean;
  critical: number;
  fumble: number;
};

/** The entries of one player inside one section, chronologically. */
export type DiceTableCell = { critical: DiceEventRow[]; fumble: DiceEventRow[] };

/** A block of rows: one arc, or all the entries when the campaign has none. */
export type DiceTableSection = {
  arc: { id: string; number: number; name: string | null } | null;
  /** How many rows the section needs: the longest column in it. */
  height: number;
  /** Per player id. */
  cells: Map<string, DiceTableCell>;
};

export type DiceTable = {
  columns: DiceTableColumn[];
  sections: DiceTableSection[];
  /** Which of the two columns each player shows (a kind filter hides the other). */
  kinds: DiceEventKind[];
};

/**
 * Lays a campaign's entries out like the Excel it replaces: a column pair per
 * player and one row per entry, split into a section per arc when the campaign
 * has arcs. Column totals count every entry given (so pass the filtered set
 * whole, not a page). The column order is fixed and never by score: DMs first,
 * then alphabetical. Members with no entry still get a column (a 0 says
 * something), and so does anyone who has entries but has since left.
 *
 * @param {DiceEventRow[]} rows - The campaign's entries, oldest first.
 * @param {DiceEventCampaignContext} campaign - The campaign, for its members.
 * @param {{ userId?: string; kind?: DiceEventKind }} [filters] - Active filters: a player
 *   filter keeps only that column pair, a kind filter keeps only that column.
 * @returns {DiceTable} The columns, the sections and the visible kinds.
 */
export function buildDiceEventTable(
  rows: DiceEventRow[],
  campaign: DiceEventCampaignContext,
  filters: { userId?: string; kind?: DiceEventKind } = {},
): DiceTable {
  const people = new Map<string, { name: string; isDm: boolean }>();
  for (const member of campaign.members) {
    people.set(member.userId, { name: member.name, isDm: member.role === CampaignRole.DM });
  }
  for (const row of rows) {
    if (!people.has(row.userId)) {
      people.set(row.userId, { name: row.userName, isDm: false });
    }
  }

  const columns: DiceTableColumn[] = [...people]
    .filter(([userId]) => !filters.userId || userId === filters.userId)
    .map(([userId, person]) => ({
      userId,
      name: person.name,
      isDm: person.isDm,
      critical: rows.filter((r) => r.userId === userId && r.kind === "CRITICAL").length,
      fumble: rows.filter((r) => r.userId === userId && r.kind === "FUMBLE").length,
    }))
    .sort((a, b) => Number(b.isDm) - Number(a.isDm) || a.name.localeCompare(b.name, "es"));

  const bySection = new Map<string, DiceEventRow[]>();
  const arcs = new Map<string, NonNullable<DiceEventRow["arc"]>>();
  for (const row of rows) {
    const key = row.arc?.id ?? "";
    if (row.arc) {
      arcs.set(row.arc.id, row.arc);
    }
    bySection.set(key, [...(bySection.get(key) ?? []), row]);
  }

  const order = [
    ...[...arcs.values()].sort((a, b) => a.number - b.number).map((arc) => arc.id),
    ...(bySection.has("") ? [""] : []),
  ];

  const sections: DiceTableSection[] = order.map((key) => {
    const cells = new Map<string, DiceTableCell>();
    for (const row of bySection.get(key) ?? []) {
      const cell = cells.get(row.userId) ?? { critical: [], fumble: [] };
      (row.kind === "CRITICAL" ? cell.critical : cell.fumble).push(row);
      cells.set(row.userId, cell);
    }
    const height = Math.max(
      0,
      ...columns.map((c) => {
        const cell = cells.get(c.userId);
        return Math.max(
          !filters.kind || filters.kind === "CRITICAL" ? (cell?.critical.length ?? 0) : 0,
          !filters.kind || filters.kind === "FUMBLE" ? (cell?.fumble.length ?? 0) : 0,
        );
      }),
    );
    return { arc: key === "" ? null : (arcs.get(key) ?? null), height, cells };
  });

  return {
    columns,
    sections: sections.filter((section) => section.height > 0),
    kinds: filters.kind ? [filters.kind] : ["CRITICAL", "FUMBLE"],
  };
}
