import { seedEnvSchema } from "./seedEnv";

const VALID = {
  DATABASE_URL: "mysql://user:pass@db:3306/dmuster",
  SEED_DEFAULT_PASSWORD: "a-genuinely-chosen-password",
};

/**
 * Parses an environment with one field overridden, and reports the messages of
 * any issues raised for that field.
 *
 * @param {Partial<typeof VALID>} overrides - Fields to replace in a valid env.
 * @returns {{ ok: boolean; messages: string[] }} Whether it parsed, and why not.
 */
function parse(overrides: Partial<typeof VALID>): { ok: boolean; messages: string[] } {
  const result = seedEnvSchema.safeParse({ ...VALID, ...overrides });

  return {
    ok: result.success,
    messages: result.success ? [] : result.error.issues.map((issue) => issue.message),
  };
}

describe("seedEnvSchema", () => {
  it("accepts a real password", () => {
    expect(parse({}).ok).toBe(true);
  });

  describe("SEED_DEFAULT_PASSWORD", () => {
    // The seed gives all nine accounts the same hash, so this one string is the
    // credential for every account at once — six of which hold a DM role.
    it.each([["short"], ["abc"], [""], ["12345678901"]])(
      "rejects %p as too short",
      (password) => {
        const { ok, messages } = parse({ SEED_DEFAULT_PASSWORD: password });

        expect(ok).toBe(false);
        expect(messages.join(" ")).toMatch(/at least 12 characters/);
      },
    );

    // These are published in .env.example, in a public repository. Length alone
    // would let "change_me_seed" through at 14 characters.
    it.each([["change_me_seed"], ["change_me"], ["CHANGE_ME_SEED"], ["  change_me_seed  "]])(
      "rejects the template placeholder %p",
      (password) => {
        const { ok, messages } = parse({ SEED_DEFAULT_PASSWORD: password });

        expect(ok).toBe(false);
        expect(messages.join(" ")).toMatch(/placeholder/);
      },
    );
  });

  describe("DATABASE_URL", () => {
    it("rejects a value that is not a URL", () => {
      expect(parse({ DATABASE_URL: "not-a-url" }).ok).toBe(false);
    });
  });
});
