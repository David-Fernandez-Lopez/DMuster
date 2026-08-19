import { signState, verifyState } from "@/lib/google/oauthState";

const SECRET = "test-secret";
const MAX_AGE_MS = 10 * 60 * 1000;

describe("signState / verifyState", () => {
  it("round-trips a signed state", () => {
    const state = signState({ userId: "user-1", nonce: "nonce-1" }, SECRET);

    expect(verifyState(state, SECRET, MAX_AGE_MS)).toEqual({
      userId: "user-1",
      nonce: "nonce-1",
    });
  });

  it("rejects a tampered signature", () => {
    const state = signState({ userId: "user-1", nonce: "nonce-1" }, SECRET);
    const [encoded] = state.split(".");

    expect(verifyState(`${encoded}.deadbeef`, SECRET, MAX_AGE_MS)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const state = signState({ userId: "user-1", nonce: "nonce-1" }, SECRET);
    const [, signature] = state.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: "attacker", nonce: "nonce-1", iat: Date.now() }),
    ).toString("base64url");

    expect(verifyState(`${forgedPayload}.${signature}`, SECRET, MAX_AGE_MS)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const state = signState({ userId: "user-1", nonce: "nonce-1" }, "other-secret");

    expect(verifyState(state, SECRET, MAX_AGE_MS)).toBeNull();
  });

  it("rejects an expired state", () => {
    const state = signState({ userId: "user-1", nonce: "nonce-1" }, SECRET);

    // Any elapsed time exceeds a negative max age, so this is expired without needing fake timers.
    expect(verifyState(state, SECRET, -1)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyState("not-a-valid-state", SECRET, MAX_AGE_MS)).toBeNull();
    expect(verifyState("", SECRET, MAX_AGE_MS)).toBeNull();
    expect(verifyState(".", SECRET, MAX_AGE_MS)).toBeNull();
  });
});
