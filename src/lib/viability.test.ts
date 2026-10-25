import {
  computeCampaignViability,
  computeViability,
  isAvailableResponse,
  isRequiredMember,
  isViable,
  resolveMemberAvailability,
  type MemberAvailability,
  type ViabilityMember,
} from "@/lib/viability";

/** A DM's input to `computeCampaignViability` (always required). */
function dm(availability: MemberAvailability): ViabilityMember {
  return { availability, isDm: true, optional: false };
}

/** A required player's input to `computeCampaignViability`. */
function required(availability: MemberAvailability): ViabilityMember {
  return { availability, isDm: false, optional: false };
}

/** An optional player's input to `computeCampaignViability`. */
function optional(availability: MemberAvailability): ViabilityMember {
  return { availability, isDm: false, optional: true };
}

describe("computeViability", () => {
  it("returns B when a member already plays another session that day", () => {
    expect(computeViability(["YES", "BUSY"])).toBe("B");
    expect(computeViability(["ONLINE", "BUSY"])).toBe("B");
    expect(computeViability(["MAYBE", undefined, "BUSY"])).toBe("B");
  });

  it("prioritises B over N (a confirmed session elsewhere outranks a NO)", () => {
    expect(computeViability(["NO", "BUSY"])).toBe("B");
  });

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

describe("computeCampaignViability", () => {
  it("matches computeViability when everyone is required and there is no minimum", () => {
    const cases: MemberAvailability[][] = [
      ["YES", "BUSY"],
      ["NO", "BUSY"],
      ["YES", "YES", "YES"],
      ["YES", "ONLINE"],
      ["ONLINE", "MAYBE"],
      ["ONLINE", undefined],
      ["YES", "NO", "MAYBE"],
      ["YES", undefined],
      [],
    ];
    for (const statuses of cases) {
      const members = statuses.map((status, index) =>
        index === 0 ? dm(status) : required(status),
      );
      expect(computeCampaignViability(members, null)).toBe(computeViability(statuses));
    }
  });

  it("ignores an optional player who cannot play (Salgado: only Cgoob is needed)", () => {
    expect(
      computeCampaignViability([dm("YES"), required("YES"), optional("NO")], null),
    ).toBe("S");
    expect(
      computeCampaignViability([dm("YES"), required("YES"), optional("BUSY")], null),
    ).toBe("S");
    expect(
      computeCampaignViability([dm("YES"), required("YES"), optional(undefined)], null),
    ).toBe("S");
  });

  it("keeps blocking on a required player's answer", () => {
    expect(
      computeCampaignViability([dm("YES"), required("NO"), optional("YES")], null),
    ).toBe("N");
    expect(
      computeCampaignViability([dm("YES"), required("MAYBE"), optional("YES")], null),
    ).toBe("T");
    expect(
      computeCampaignViability([dm("YES"), required("BUSY"), optional("YES")], null),
    ).toBe("B");
  });

  it("treats every DM as required, even if flagged optional", () => {
    expect(
      computeCampaignViability(
        [{ availability: "NO", isDm: true, optional: true }, optional("YES")],
        null,
      ),
    ).toBe("N");
  });

  it("is viable once enough players can play (Adri: any 3 will do)", () => {
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional("YES"), optional("YES"), optional("NO")],
        3,
      ),
    ).toBe("S");
  });

  it("returns T when the MAYBE/pending players could still reach the minimum", () => {
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional("YES"), optional("MAYBE"), optional("NO")],
        3,
      ),
    ).toBe("T");
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional(undefined), optional(undefined)],
        3,
      ),
    ).toBe("T");
  });

  it("returns B when only the busy players could reach the minimum", () => {
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional("YES"), optional("BUSY"), optional("NO")],
        3,
      ),
    ).toBe("B");
  });

  it("returns N when the minimum is out of reach even if everyone else said yes", () => {
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional("BUSY"), optional("NO"), optional("NO")],
        3,
      ),
    ).toBe("N");
  });

  it("never counts a DM towards the minimum", () => {
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional("YES"), optional("NO")],
        3,
      ),
    ).toBe("N");
  });

  it("counts required players towards the minimum too", () => {
    expect(
      computeCampaignViability(
        [dm("YES"), required("YES"), optional("YES"), optional("YES"), optional("NO")],
        3,
      ),
    ).toBe("S");
  });

  it("returns the stronger block when both the required players and the minimum fail", () => {
    // Cgoob is pending (T) and the minimum only fails because of busy players (B).
    expect(
      computeCampaignViability(
        [dm("YES"), required(undefined), optional("YES"), optional("BUSY"), optional("NO")],
        3,
      ),
    ).toBe("B");
    // Cgoob said no (N) while the minimum is still reachable (T).
    expect(
      computeCampaignViability(
        [dm("YES"), required("NO"), optional("YES"), optional("MAYBE")],
        2,
      ),
    ).toBe("N");
  });

  it("still needs one player when every player is optional and there is no minimum", () => {
    // The DM alone never makes a session, even if the last required player left.
    expect(computeCampaignViability([dm("YES"), optional("NO"), optional("NO")], null)).toBe(
      "N",
    );
    expect(
      computeCampaignViability([dm("YES"), optional("MAYBE"), optional("NO")], null),
    ).toBe("T");
    expect(computeCampaignViability([dm("YES"), optional("YES"), optional("NO")], null)).toBe(
      "S",
    );
  });

  it("leaves a campaign with no players to its DM", () => {
    expect(computeCampaignViability([dm("YES")], null)).toBe("S");
  });

  it("returns O when someone who will play is online, required or optional", () => {
    expect(
      computeCampaignViability([dm("YES"), required("ONLINE"), optional("NO")], null),
    ).toBe("O");
    expect(
      computeCampaignViability([dm("YES"), required("YES"), optional("ONLINE")], null),
    ).toBe("O");
    expect(
      computeCampaignViability(
        [dm("YES"), optional("YES"), optional("ONLINE"), optional("NO")],
        2,
      ),
    ).toBe("O");
  });
});

describe("isRequiredMember", () => {
  it("requires every DM and every non-optional player", () => {
    expect(isRequiredMember({ isDm: true, optional: false })).toBe(true);
    expect(isRequiredMember({ isDm: true, optional: true })).toBe(true);
    expect(isRequiredMember({ isDm: false, optional: false })).toBe(true);
  });

  it("does not require an optional player", () => {
    expect(isRequiredMember({ isDm: false, optional: true })).toBe(false);
  });
});

describe("isViable", () => {
  it("accepts S and O", () => {
    expect(isViable("S")).toBe(true);
    expect(isViable("O")).toBe(true);
  });

  it("rejects T, N and B", () => {
    expect(isViable("T")).toBe(false);
    expect(isViable("N")).toBe(false);
    expect(isViable("B")).toBe(false);
  });
});

describe("resolveMemberAvailability", () => {
  it("lets being busy override any answer", () => {
    expect(resolveMemberAvailability("YES", true)).toBe("BUSY");
    expect(resolveMemberAvailability("NO", true)).toBe("BUSY");
    expect(resolveMemberAvailability(null, true)).toBe("BUSY");
  });

  it("keeps the stored answer when the member is free", () => {
    expect(resolveMemberAvailability("ONLINE", false)).toBe("ONLINE");
    expect(resolveMemberAvailability("MAYBE", false)).toBe("MAYBE");
  });

  it("maps a missing answer to the pending undefined", () => {
    expect(resolveMemberAvailability(null, false)).toBeUndefined();
    expect(resolveMemberAvailability(undefined, false)).toBeUndefined();
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
