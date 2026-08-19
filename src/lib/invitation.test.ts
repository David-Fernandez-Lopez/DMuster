import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  invitationExpiresAt,
  invitationStatus,
} from "@/lib/invitation";

describe("generateInvitationToken", () => {
  it("generates different tokens on each call", () => {
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });
});

describe("hashInvitationToken", () => {
  it("is stable for the same input", () => {
    const raw = generateInvitationToken();
    expect(hashInvitationToken(raw)).toBe(hashInvitationToken(raw));
  });

  it("never equals the raw token", () => {
    const raw = generateInvitationToken();
    expect(hashInvitationToken(raw)).not.toBe(raw);
  });

  it("produces a 64-character lowercase hex digest", () => {
    expect(hashInvitationToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("invitationExpiresAt", () => {
  it("adds INVITATION_TTL_DAYS days to the given instant", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const expected = new Date(now);
    expected.setUTCDate(expected.getUTCDate() + INVITATION_TTL_DAYS);

    expect(invitationExpiresAt(now)).toEqual(expected);
  });
});

describe("invitationStatus", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");
  const future = new Date("2026-08-26T12:00:00.000Z");
  const past = new Date("2026-08-12T12:00:00.000Z");

  it("is pending before expiry with no accept/revoke", () => {
    expect(
      invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: future }, now),
    ).toBe("pending");
  });

  it("is expired once now reaches expiresAt", () => {
    expect(
      invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: now }, now),
    ).toBe("expired");
    expect(
      invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: past }, now),
    ).toBe("expired");
  });

  it("is not yet expired one millisecond before the boundary", () => {
    const justBefore = new Date(now.getTime() - 1);
    expect(
      invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: now }, justBefore),
    ).toBe("pending");
  });

  it("is revoked when revokedAt is set and it was never accepted", () => {
    expect(
      invitationStatus({ acceptedAt: null, revokedAt: now, expiresAt: future }, now),
    ).toBe("revoked");
  });

  it("is revoked even past expiry", () => {
    expect(
      invitationStatus({ acceptedAt: null, revokedAt: past, expiresAt: past }, now),
    ).toBe("revoked");
  });

  it("is accepted when acceptedAt is set, regardless of revoke or expiry", () => {
    expect(
      invitationStatus({ acceptedAt: now, revokedAt: null, expiresAt: future }, now),
    ).toBe("accepted");
    expect(
      invitationStatus({ acceptedAt: past, revokedAt: past, expiresAt: past }, now),
    ).toBe("accepted");
  });
});
