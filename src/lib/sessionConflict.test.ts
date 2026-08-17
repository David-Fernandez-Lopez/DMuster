import {
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
});
