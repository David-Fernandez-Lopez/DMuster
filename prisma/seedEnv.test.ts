import { seedEnvSchema } from "./seedEnv";

const VALID = {
  DATABASE_URL: "mysql://user:pass@db:3306/dmuster",
  SEED_USER_EMAIL: "dm@example.com",
  SEED_USER_NAME: "Game Master",
  SEED_USER_PASSWORD: "a-genuinely-chosen-password",
  SEED_CAMPAIGN_NAME: "First campaign",
  SEED_CAMPAIGN_TAG: "FC",
};

/**
 * Parses an environment with some fields overridden, and reports the messages
 * of any issues raised.
 *
 * @param {Partial<Record<keyof typeof VALID, string | undefined>>} overrides - Fields to replace in a valid env.
 * @returns {{ ok: boolean; messages: string[] }} Whether it parsed, and why not.
 */
function parse(
  overrides: Partial<Record<keyof typeof VALID, string | undefined>>,
): { ok: boolean; messages: string[] } {
  const result = seedEnvSchema.safeParse({ ...VALID, ...overrides });

  return {
    ok: result.success,
    messages: result.success ? [] : result.error.issues.map((issue) => issue.message),
  };
}

describe("seedEnvSchema", () => {
  it("accepts a complete environment", () => {
    expect(parse({}).ok).toBe(true);
  });

  // Nothing personal lives in the source, so every value is required.
  it.each(Object.keys(VALID))("rejects a missing %s", (key) => {
    expect(parse({ [key]: undefined }).ok).toBe(false);
  });

  describe("SEED_USER_EMAIL", () => {
    it("rejects a value that is not an email", () => {
      expect(parse({ SEED_USER_EMAIL: "not-an-email" }).ok).toBe(false);
    });

    // Login lowercases the typed email before the lookup.
    it("lowercases the address", () => {
      const result = seedEnvSchema.safeParse({ ...VALID, SEED_USER_EMAIL: "DM@Example.com" });

      expect(result.success && result.data.SEED_USER_EMAIL).toBe("dm@example.com");
    });
  });

  describe("SEED_USER_NAME", () => {
    it("rejects characters an invited user could not choose either", () => {
      expect(parse({ SEED_USER_NAME: "<b>DM</b>" }).ok).toBe(false);
    });
  });

  describe("SEED_USER_PASSWORD", () => {
    it.each([["short"], ["abc"], [""], ["12345678901"]])(
      "rejects %p as too short",
      (password) => {
        const { ok, messages } = parse({ SEED_USER_PASSWORD: password });

        expect(ok).toBe(false);
        expect(messages.join(" ")).toMatch(/at least 12 characters/);
      },
    );

    // These are published in .env.example, in a public repository. Length alone
    // would let "change_me_seed" through at 14 characters.
    it.each([["change_me_seed"], ["change_me"], ["CHANGE_ME_SEED"], ["  change_me_seed  "]])(
      "rejects the template placeholder %p",
      (password) => {
        const { ok, messages } = parse({ SEED_USER_PASSWORD: password });

        expect(ok).toBe(false);
        expect(messages.join(" ")).toMatch(/placeholder/);
      },
    );

    it("rejects a password longer than bcrypt reads", () => {
      expect(parse({ SEED_USER_PASSWORD: "x".repeat(73) }).ok).toBe(false);
    });
  });

  describe("SEED_CAMPAIGN_TAG", () => {
    it("uppercases a valid tag", () => {
      const result = seedEnvSchema.safeParse({ ...VALID, SEED_CAMPAIGN_TAG: "fc" });

      expect(result.success && result.data.SEED_CAMPAIGN_TAG).toBe("FC");
    });

    it.each([["F"], ["FCX"], ["F!"]])("rejects %p", (tag) => {
      expect(parse({ SEED_CAMPAIGN_TAG: tag }).ok).toBe(false);
    });
  });

  describe("DATABASE_URL", () => {
    it("rejects a value that is not a URL", () => {
      expect(parse({ DATABASE_URL: "not-a-url" }).ok).toBe(false);
    });
  });
});
