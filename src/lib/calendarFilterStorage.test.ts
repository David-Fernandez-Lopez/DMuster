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
