import {
  computeViability,
  isAvailableResponse,
  isViable,
} from "@/lib/viability";

describe("computeViability", () => {
  it("returns S when every member confirms (all YES)", () => {
    expect(computeViability(["YES", "YES", "YES"])).toBe("S");
  });

  it("returns O when everyone can play and someone plays ONLINE", () => {
    expect(computeViability(["YES", "ONLINE"])).toBe("O");
    expect(computeViability(["ONLINE", "ONLINE"])).toBe("O");
  });

  it("prioritises T over O (MAYBE or pending wins over ONLINE)", () => {
    expect(computeViability(["ONLINE", "MAYBE"])).toBe("T");
    expect(computeViability(["ONLINE", undefined])).toBe("T");
  });

  it("prioritises N over O (NO wins over ONLINE)", () => {
    expect(computeViability(["ONLINE", "NO"])).toBe("N");
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

describe("isViable", () => {
  it("accepts S and O", () => {
    expect(isViable("S")).toBe(true);
    expect(isViable("O")).toBe(true);
  });

  it("rejects T and N", () => {
    expect(isViable("T")).toBe(false);
    expect(isViable("N")).toBe(false);
  });
});

describe("isAvailableResponse", () => {
  it("accepts YES and ONLINE", () => {
    expect(isAvailableResponse("YES")).toBe(true);
    expect(isAvailableResponse("ONLINE")).toBe(true);
  });

  it("rejects MAYBE, NO and a missing answer", () => {
    expect(isAvailableResponse("MAYBE")).toBe(false);
    expect(isAvailableResponse("NO")).toBe(false);
    expect(isAvailableResponse(null)).toBe(false);
    expect(isAvailableResponse(undefined)).toBe(false);
  });
});
