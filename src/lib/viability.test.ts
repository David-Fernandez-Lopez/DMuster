import { computeViability } from "@/lib/viability";

describe("computeViability", () => {
  it("returns S when every member confirms (all YES)", () => {
    expect(computeViability(["YES", "YES", "YES"])).toBe("S");
  });

  it("returns N when any member responds NO", () => {
    expect(computeViability(["NO"])).toBe("N");
    expect(computeViability(["YES", "NO", "MAYBE"])).toBe("N");
  });

  it("prioritises N over pending (NO wins over MAYBE/undefined)", () => {
    expect(computeViability(["NO", "MAYBE", undefined])).toBe("N");
  });

  it("returns T when someone responds MAYBE and nobody says NO", () => {
    expect(computeViability(["YES", "MAYBE"])).toBe("T");
  });

  it("returns T when a response is missing (pending) and nobody says NO", () => {
    expect(computeViability(["YES", undefined])).toBe("T");
  });

  it("returns S for an empty campaign (vacuously all confirmed)", () => {
    expect(computeViability([])).toBe("S");
  });
});
