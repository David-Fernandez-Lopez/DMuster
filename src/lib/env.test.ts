import { envSchema } from "@/lib/envSchema";

const VALID = {
  DATABASE_URL: "mysql://user:pass@db:3306/dmuster",
  AUTH_SECRET: "4Ck9Xr2sVmQ7pLd0aZbN8yTfHjEuWgRi",
  AUTH_URL: "http://localhost:3000",
};

/**
 * Parses an environment with fields overridden, reporting whether it passed and
 * the messages of any issues raised.
 *
 * @param {Record<string, unknown>} overrides - Fields to replace or add.
 * @returns {{ ok: boolean; messages: string }} Whether it parsed, and why not.
 */
function parse(overrides: Record<string, unknown> = {}): { ok: boolean; messages: string } {
  const result = envSchema.safeParse({ ...VALID, ...overrides });

  return {
    ok: result.success,
    messages: result.success ? "" : result.error.issues.map((issue) => issue.message).join(" | "),
  };
}

describe("envSchema", () => {
  it("accepts a real configuration", () => {
    expect(parse().ok).toBe(true);
  });

  describe("AUTH_SECRET", () => {
    // It used to be `min(1)`, which accepted `change_me_secret` — the very
    // placeholder .env.example ships, in a repository anyone can read.
    it("rejects the placeholder this repository publishes", () => {
      const { ok, messages } = parse({ AUTH_SECRET: "change_me_secret" });

      expect(ok).toBe(false);
      expect(messages).toMatch(/at least 32 characters/);
    });

    it.each([[""], ["short"], ["a".repeat(31)]])("rejects %p as too short", (secret) => {
      expect(parse({ AUTH_SECRET: secret }).ok).toBe(false);
    });

    it("accepts exactly 32 characters", () => {
      expect(parse({ AUTH_SECRET: "a".repeat(32) }).ok).toBe(true);
    });

    it("accepts what openssl rand -base64 32 produces", () => {
      // 44 characters, the real-world shape.
      expect(parse({ AUTH_SECRET: "Qsu9ykkLwW6wA/57ZCTSuMzEpYH2/P6V8kKaWuw5CEbZ" }).ok).toBe(true);
    });

    it("is required", () => {
      const result = envSchema.safeParse({ DATABASE_URL: VALID.DATABASE_URL });

      expect(result.success).toBe(false);
    });
  });

  describe("CRON_SECRET", () => {
    // Unset disables the sweeper routes entirely, which is a legitimate way to
    // run this app — so absence must stay valid while a weak value must not.
    it.each([[undefined], [""]])("accepts %p, which disables the cron routes", (secret) => {
      expect(parse({ CRON_SECRET: secret }).ok).toBe(true);
    });

    it("rejects a short secret", () => {
      const { ok, messages } = parse({ CRON_SECRET: "hunter2" });

      expect(ok).toBe(false);
      expect(messages).toMatch(/at least 32 characters/);
    });

    it("accepts a real one", () => {
      expect(parse({ CRON_SECRET: "b".repeat(44) }).ok).toBe(true);
    });
  });

  describe("AUTH_URL", () => {
    // Deliberately not required to be https. This deployment is served over
    // plain HTTP; demanding a scheme it cannot provide would stop the app
    // booting to enforce a property nothing here can hold. Guarded so the
    // requirement is not added by reflex — the change to make when TLS arrives
    // is Auth.js's `useSecureCookies`, not a rule in the schema.
    it("accepts http", () => {
      expect(parse({ AUTH_URL: "http://localhost:3000" }).ok).toBe(true);
      expect(parse({ AUTH_URL: "http://192.168.1.50:3000" }).ok).toBe(true);
    });

    it("accepts https too", () => {
      expect(parse({ AUTH_URL: "https://dmuster.example" }).ok).toBe(true);
    });

    // `z.url()` alone accepts this: the WHATWG parser reads it as scheme
    // `localhost:` with path `3000`. A valid URL, and a useless AUTH_URL.
    it("rejects a value with no scheme", () => {
      const { ok, messages } = parse({ AUTH_URL: "localhost:3000" });

      expect(ok).toBe(false);
      expect(messages).toMatch(/http:\/\/ or https:\/\//);
    });

    it("rejects a scheme that is not http", () => {
      expect(parse({ AUTH_URL: "ftp://dmuster.example" }).ok).toBe(false);
    });

    it("is required in production", () => {
      const { ok, messages } = parse({ NODE_ENV: "production", AUTH_URL: undefined });

      expect(ok).toBe(false);
      expect(messages).toMatch(/required in production/);
    });
  });

  describe("APP_TIMEZONE", () => {
    it("defaults to Europe/Madrid", () => {
      const result = envSchema.safeParse(VALID);

      expect(result.success && result.data.APP_TIMEZONE).toBe("Europe/Madrid");
    });

    it("rejects a name Intl does not know", () => {
      const { ok, messages } = parse({ APP_TIMEZONE: "Europe/Madridd" });

      expect(ok).toBe(false);
      expect(messages).toMatch(/valid IANA timezone/);
    });
  });
});
