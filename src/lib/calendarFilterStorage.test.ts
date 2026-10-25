import { ALL_VIABILITIES, parseStoredSelection } from "@/lib/calendarFilterStorage";

describe("parseStoredSelection — viability tiers", () => {
  it("shows the busy tier B for a selection saved before it existed", () => {
    // Stored before B was added: only "No" was hidden.
    const selection = parseStoredSelection('{"viabilities":["N"]}', [], []);

    expect(selection.viabilities.has("B")).toBe(true);
    expect(selection.viabilities.has("N")).toBe(false);
  });

  it("shows all five tiers when the stored value is corrupt", () => {
    const selection = parseStoredSelection("{not json", [], []);

    expect([...selection.viabilities].sort()).toEqual([...ALL_VIABILITIES].sort());
    expect(selection.viabilities.size).toBe(5);
  });
});

describe("parseStoredSelection — other campaigns' sessions", () => {
  it("shows them when nothing is stored", () => {
    expect(parseStoredSelection(null, [], []).showForeignSessions).toBe(true);
  });

  it("shows them for a selection saved before the toggle existed", () => {
    const selection = parseStoredSelection(
      '{"campaigns":[],"masters":[],"viabilities":["N"]}',
      [],
      [],
    );

    expect(selection.showForeignSessions).toBe(true);
  });

  it("hides them only when the user turned them off", () => {
    const selection = parseStoredSelection('{"hideForeignSessions":true}', [], []);

    expect(selection.showForeignSessions).toBe(false);
  });

  it("ignores a hide flag that is not exactly true", () => {
    const selection = parseStoredSelection('{"hideForeignSessions":"yes"}', [], []);

    expect(selection.showForeignSessions).toBe(true);
  });
});
