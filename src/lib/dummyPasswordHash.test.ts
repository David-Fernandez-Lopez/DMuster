import bcrypt from "bcryptjs";

import { DUMMY_PASSWORD_HASH } from "@/lib/dummyPasswordHash";

describe("DUMMY_PASSWORD_HASH", () => {
  it("is exactly 60 characters", () => {
    // bcryptjs checks this length before doing any work and returns false
    // immediately when it does not match, so 59 or 61 characters silently
    // disables the comparison this constant exists to perform.
    expect(DUMMY_PASSWORD_HASH).toHaveLength(60);
  });

  it("has a valid bcrypt prefix and cost factor", () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("actually derives a hash rather than short-circuiting", () => {
    // The property that matters is not the return value — a wrong password
    // returns false either way — but that bcrypt was made to do the work. A
    // malformed hash returns in microseconds; a real one costs milliseconds.
    const start = process.hrtime.bigint();
    const matches = bcrypt.compareSync("any password at all", DUMMY_PASSWORD_HASH);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    expect(matches).toBe(false);
    expect(elapsedMs).toBeGreaterThan(1);
  });
});
