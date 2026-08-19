import { canRemoveAttendee, canSelfJoin } from "@/lib/sessionRules";

describe("canSelfJoin", () => {
  it("allows a member with YES who is not yet attending an active future session", () => {
    expect(
      canSelfJoin({
        isMember: true,
        isAttendee: false,
        status: "YES",
        sessionActive: true,
        isPast: false,
      }),
    ).toBe(true);
  });

  it("refuses a non-member", () => {
    expect(
      canSelfJoin({
        isMember: false,
        isAttendee: false,
        status: "YES",
        sessionActive: true,
        isPast: false,
      }),
    ).toBe(false);
  });

  it("refuses someone already attending", () => {
    expect(
      canSelfJoin({
        isMember: true,
        isAttendee: true,
        status: "YES",
        sessionActive: true,
        isPast: false,
      }),
    ).toBe(false);
  });

  it("refuses MAYBE", () => {
    expect(
      canSelfJoin({
        isMember: true,
        isAttendee: false,
        status: "MAYBE",
        sessionActive: true,
        isPast: false,
      }),
    ).toBe(false);
  });

  it("refuses no answer", () => {
    expect(
      canSelfJoin({
        isMember: true,
        isAttendee: false,
        status: null,
        sessionActive: true,
        isPast: false,
      }),
    ).toBe(false);
  });

  it("refuses a cancelled session", () => {
    expect(
      canSelfJoin({
        isMember: true,
        isAttendee: false,
        status: "YES",
        sessionActive: false,
        isPast: false,
      }),
    ).toBe(false);
  });

  it("refuses a past session", () => {
    expect(
      canSelfJoin({
        isMember: true,
        isAttendee: false,
        status: "YES",
        sessionActive: true,
        isPast: true,
      }),
    ).toBe(false);
  });
});

describe("canRemoveAttendee", () => {
  it("allows a DM to remove an attendee leaving others and a DM behind", () => {
    expect(
      canRemoveAttendee({ actorIsDm: true, remainingAttendees: 3, remainingDms: 1 }),
    ).toEqual({ allowed: true });
  });

  it("refuses a non-DM — a player cannot remove themselves", () => {
    expect(
      canRemoveAttendee({ actorIsDm: false, remainingAttendees: 3, remainingDms: 1 }),
    ).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("refuses removing the last attendee", () => {
    expect(
      canRemoveAttendee({ actorIsDm: true, remainingAttendees: 0, remainingDms: 0 }),
    ).toEqual({ allowed: false, reason: "lastAttendee" });
  });

  it("refuses leaving the session with no DM attendee", () => {
    expect(
      canRemoveAttendee({ actorIsDm: true, remainingAttendees: 2, remainingDms: 0 }),
    ).toEqual({ allowed: false, reason: "dmMustAttend" });
  });
});
