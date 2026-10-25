import {
  buildBusyIndex,
  findBusySession,
  findConflictingSessions,
  type SessionAttendance,
} from "@/lib/sessionConflict";

/**
 * Builds a `SessionAttendance` fixture with sensible defaults so each test
 * only spells out the fields it cares about.
 */
function attendance(overrides: Partial<SessionAttendance>): SessionAttendance {
  return {
    sessionId: "session-1",
    campaignId: "campaign-1",
    campaignName: "Orden del Alba",
    campaignTag: "OR",
    cancelled: false,
    attendeeIds: [],
    attendeeNames: {},
    ...overrides,
  };
}

describe("findConflictingSessions", () => {
  it("returns no conflicts when attendee sets are fully disjoint", () => {
    const conflicts = findConflictingSessions(
      ["alice", "bob"],
      [attendance({ attendeeIds: ["carol", "dave"] })],
    );

    expect(conflicts).toEqual([]);
  });

  it("blocks when one player is shared, naming them", () => {
    const conflicts = findConflictingSessions(
      ["alice", "bob"],
      [
        attendance({
          sessionId: "session-2",
          campaignId: "campaign-2",
          campaignName: "Cyberpunk",
          attendeeIds: ["bob", "carol"],
          attendeeNames: { bob: "Bob", carol: "Carol" },
        }),
      ],
    );

    expect(conflicts).toEqual([
      {
        sessionId: "session-2",
        campaignId: "campaign-2",
        campaignName: "Cyberpunk",
        sharedNames: ["Bob"],
      },
    ]);
  });

  it("blocks when only the shared person is a DM", () => {
    // A DM is just another attendee id here — no special case needed.
    const conflicts = findConflictingSessions(
      ["dm-1"],
      [
        attendance({
          attendeeIds: ["dm-1", "player-2"],
          attendeeNames: { "dm-1": "David (Máster)", "player-2": "Ana" },
        }),
      ],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].sharedNames).toEqual(["David (Máster)"]);
  });

  it("excludes the session being edited via excludeSessionId", () => {
    const conflicts = findConflictingSessions(
      ["alice"],
      [
        attendance({
          sessionId: "session-being-edited",
          attendeeIds: ["alice"],
          attendeeNames: { alice: "Alice" },
        }),
      ],
      "session-being-edited",
    );

    expect(conflicts).toEqual([]);
  });

  it("ignores a cancelled session — its attendees are free again", () => {
    const conflicts = findConflictingSessions(
      ["alice"],
      [
        attendance({
          cancelled: true,
          attendeeIds: ["alice"],
          attendeeNames: { alice: "Alice" },
        }),
      ],
    );

    expect(conflicts).toEqual([]);
  });

  it("returns no conflicts for an empty attendee list", () => {
    const conflicts = findConflictingSessions(
      [],
      [attendance({ attendeeIds: ["alice"], attendeeNames: { alice: "Alice" } })],
    );

    expect(conflicts).toEqual([]);
  });

  it("reports multiple shared people sorted alphabetically", () => {
    const conflicts = findConflictingSessions(
      ["alice", "bob", "carol"],
      [
        attendance({
          attendeeIds: ["carol", "alice", "dave"],
          attendeeNames: { carol: "Carol", alice: "Alice", dave: "Dave" },
        }),
      ],
    );

    expect(conflicts[0].sharedNames).toEqual(["Alice", "Carol"]);
  });

  it("reports one conflict entry per blocking session", () => {
    const conflicts = findConflictingSessions(
      ["alice"],
      [
        attendance({
          sessionId: "session-a",
          campaignName: "Campaign A",
          attendeeIds: ["alice"],
          attendeeNames: { alice: "Alice" },
        }),
        attendance({
          sessionId: "session-b",
          campaignName: "Campaign B",
          attendeeIds: ["alice"],
          attendeeNames: { alice: "Alice" },
        }),
      ],
    );

    expect(conflicts).toHaveLength(2);
  });

  it("frees a player excluded from a forced session's attendee set for another campaign the same day", () => {
    // Roadmap #22: the lock follows attendees, not membership — a member left
    // out of one campaign's session is free to play a different one that day.
    const conflicts = findConflictingSessions(
      ["carol"],
      [
        attendance({
          sessionId: "session-a",
          campaignName: "Orden del Alba",
          attendeeIds: ["alice", "bob"], // carol was deliberately left out
          attendeeNames: { alice: "Alice", bob: "Bob" },
        }),
      ],
    );

    expect(conflicts).toEqual([]);
  });

  describe("what a conflict reports", () => {
    // `campaignName` is what the conflict errors show: every requester gets the
    // blocking campaign's name, since the calendar already shows every
    // campaign's sessions to the whole group (see
    // `confirmedSessionService.describeConflict`).
    it("names the blocking campaign, which the error message shows", () => {
      const [conflict] = findConflictingSessions(
        ["alice"],
        [
          attendance({
            sessionId: "session-9",
            campaignId: "campaign-9",
            campaignName: "Vampiro",
            attendeeIds: ["alice"],
            attendeeNames: { alice: "Alice" },
          }),
        ],
      );

      expect(conflict).toMatchObject({
        sessionId: "session-9",
        campaignId: "campaign-9",
        campaignName: "Vampiro",
      });
    });

    it("carries the campaign id of the blocking session", () => {
      const [conflict] = findConflictingSessions(
        ["alice"],
        [attendance({ campaignId: "campaign-42", attendeeIds: ["alice"] })],
      );

      expect(conflict.campaignId).toBe("campaign-42");
    });
  });
});

describe("buildBusyIndex / findBusySession", () => {
  const academia = attendance({
    sessionId: "session-ac",
    campaignId: "academia",
    campaignName: "Academia Arcana",
    campaignTag: "AC",
    attendeeIds: ["paola", "dm-david"],
    attendeeNames: { paola: "Paola", "dm-david": "David" },
  });

  it("marks an attendee of another campaign's session as busy, with its name and tag", () => {
    const index = buildBusyIndex([academia]);

    expect(findBusySession(index, "paola", "poulard")).toEqual({
      campaignId: "academia",
      campaignName: "Academia Arcana",
      campaignTag: "AC",
    });
  });

  it("does not make an attendee busy for their own campaign's session", () => {
    const index = buildBusyIndex([academia]);

    expect(findBusySession(index, "paola", "academia")).toBeNull();
  });

  it("leaves a member who is not an attendee free (the lock follows attendees)", () => {
    // A forced session that left "tucho" out: being a member of Academia is
    // not enough to be busy for another campaign that day.
    const index = buildBusyIndex([academia]);

    expect(findBusySession(index, "tucho", "poulard")).toBeNull();
  });

  it("counts a DM attendee like any other", () => {
    const index = buildBusyIndex([academia]);

    expect(findBusySession(index, "dm-david", "poulard")?.campaignTag).toBe("AC");
  });

  it("ignores a cancelled session — its attendees are free again", () => {
    const index = buildBusyIndex([{ ...academia, cancelled: true }]);

    expect(findBusySession(index, "paola", "poulard")).toBeNull();
  });

  it("reports the other campaign when a race double-booked someone", () => {
    const poulard = attendance({
      sessionId: "session-po",
      campaignId: "poulard",
      campaignName: "Poulard",
      campaignTag: "PO",
      attendeeIds: ["paola"],
    });
    const index = buildBusyIndex([poulard, academia]);

    expect(findBusySession(index, "paola", "poulard")?.campaignId).toBe("academia");
    expect(findBusySession(index, "paola", "academia")?.campaignId).toBe("poulard");
  });

  it("agrees with findConflictingSessions for a single person", () => {
    // Busy for C is exactly "adding them to C's session would conflict with a
    // session of another campaign" — same rule, two call shapes.
    const sessions = [
      academia,
      attendance({
        sessionId: "session-cp",
        campaignId: "cyberPunk",
        campaignName: "Cyberpunk",
        campaignTag: "CP",
        attendeeIds: ["salgado"],
      }),
    ];
    const index = buildBusyIndex(sessions);

    for (const userId of ["paola", "dm-david", "salgado", "ana"]) {
      for (const campaignId of ["academia", "cyberPunk", "poulard"]) {
        const others = sessions.filter((session) => session.campaignId !== campaignId);
        const conflicts = findConflictingSessions([userId], others);
        expect(findBusySession(index, userId, campaignId) !== null).toBe(
          conflicts.length > 0,
        );
      }
    }
  });
});
