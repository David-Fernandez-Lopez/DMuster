import { buildDiceEventTable } from "@/lib/diceEventTable";
import type { DiceEventCampaignContext, DiceEventRow } from "@/lib/diceEventService";

jest.mock("@/generated/prisma/enums", () => ({ CampaignRole: { DM: "DM", PLAYER: "PLAYER" } }));
jest.mock("@/generated/prisma/client", () => ({ Prisma: {} }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/today", () => ({ todayIso: () => "2026-11-22", nowStamp: () => ({ date: "2026-11-22", time: "10:00" }) }));

const campaign: DiceEventCampaignContext = {
  id: "c",
  name: "Academia",
  tag: "AC",
  colorSlot: 0,
  members: [
    { userId: "u-zoe", name: "Zoe", role: "PLAYER" },
    { userId: "u-ana", name: "Ana", role: "PLAYER" },
    { userId: "u-dm", name: "Sergio", role: "DM" },
  ],
  arcs: [
    { id: "a1", number: 1, name: null },
    { id: "a2", number: 2, name: "Saevis" },
  ],
};

let n = 0;
function row(userId: string, kind: "CRITICAL" | "FUMBLE", skill: string, arcId: string | null = null): DiceEventRow {
  n += 1;
  const arc = campaign.arcs.find((a) => a.id === arcId) ?? null;
  return {
    id: `e${n}`,
    campaignId: "c",
    campaignName: "Academia",
    campaignTag: "AC",
    campaignColorSlot: 0,
    userId,
    userName: campaign.members.find((m) => m.userId === userId)?.name ?? "Ex Member",
    kind,
    skill,
    date: "2025-12-06",
    time: null,
    arc,
    sessionId: null,
    createdByName: "x",
  };
}

describe("buildDiceEventTable", () => {
  it("orders columns DMs first, then alphabetical, and keeps members with no entries", () => {
    const table = buildDiceEventTable([row("u-zoe", "CRITICAL", "ATAQUE")], campaign);

    expect(table.columns.map((c) => c.name)).toEqual(["Sergio", "Ana", "Zoe"]);
    expect(table.columns.find((c) => c.name === "Ana")).toMatchObject({ critical: 0, fumble: 0 });
  });

  it("totals every entry per column and kind", () => {
    const table = buildDiceEventTable(
      [row("u-ana", "CRITICAL", "A"), row("u-ana", "CRITICAL", "B"), row("u-ana", "FUMBLE", "C")],
      campaign,
    );

    expect(table.columns.find((c) => c.name === "Ana")).toMatchObject({ critical: 2, fumble: 1 });
  });

  it("makes one section per arc in order, 'no arc' last, and drops empty ones", () => {
    const table = buildDiceEventTable(
      [row("u-ana", "FUMBLE", "A", null), row("u-ana", "CRITICAL", "B", "a2"), row("u-zoe", "CRITICAL", "C", "a2")],
      campaign,
    );

    expect(table.sections.map((s) => s.arc?.number ?? null)).toEqual([2, null]);
    expect(table.sections[0].height).toBe(1);
  });

  it("sets a section's height to its longest column", () => {
    const table = buildDiceEventTable(
      [row("u-ana", "CRITICAL", "A"), row("u-ana", "CRITICAL", "B"), row("u-ana", "CRITICAL", "C"), row("u-zoe", "FUMBLE", "D")],
      campaign,
    );

    expect(table.sections).toHaveLength(1);
    expect(table.sections[0].height).toBe(3);
    expect(table.sections[0].cells.get("u-ana")?.critical.map((r) => r.skill)).toEqual(["A", "B", "C"]);
  });

  it("adds a column for someone with entries who is no longer a member", () => {
    const table = buildDiceEventTable([row("u-gone", "FUMBLE", "A")], campaign);

    expect(table.columns.map((c) => c.name)).toContain("Ex Member");
  });

  it("keeps only the filtered player and the filtered kind", () => {
    const rows = [row("u-ana", "CRITICAL", "A"), row("u-ana", "FUMBLE", "B"), row("u-zoe", "CRITICAL", "C")];

    const table = buildDiceEventTable(rows.filter((r) => r.userId === "u-ana" && r.kind === "FUMBLE"), campaign, {
      userId: "u-ana",
      kind: "FUMBLE",
    });

    expect(table.columns.map((c) => c.name)).toEqual(["Ana"]);
    expect(table.kinds).toEqual(["FUMBLE"]);
    expect(table.sections[0].height).toBe(1);
  });

  it("has no sections when there are no entries", () => {
    expect(buildDiceEventTable([], campaign).sections).toEqual([]);
  });
});
