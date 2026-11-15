import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetTokenUsable,
  PASSWORD_RESET_LOG_RETENTION_DAYS,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetExpiresAt,
  passwordResetLockName,
  pruneCutoffs,
  RATE_LIMIT_WINDOW_MINUTES,
  rateLimitWindowStart,
} from "@/lib/passwordReset";

describe("password reset tokens", () => {
  it("generates a different url-safe token each time", () => {
    const a = generatePasswordResetToken();
    expect(a).not.toBe(generatePasswordResetToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes to a stable 64-char hex digest that is not the raw token", () => {
    const raw = generatePasswordResetToken();
    expect(hashPasswordResetToken(raw)).toBe(hashPasswordResetToken(raw));
    expect(hashPasswordResetToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPasswordResetToken(raw)).not.toBe(raw);
  });
});

describe("expiry and usability", () => {
  const now = new Date("2026-11-15T12:00:00.000Z");

  it("expires PASSWORD_RESET_TTL_MINUTES after issue", () => {
    expect(passwordResetExpiresAt(now).getTime() - now.getTime()).toBe(
      PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );
  });

  it("is usable when unused and before expiry", () => {
    expect(isPasswordResetTokenUsable({ usedAt: null, supersededAt: null, expiresAt: passwordResetExpiresAt(now) }, now)).toBe(true);
  });

  it("is not usable once used", () => {
    expect(isPasswordResetTokenUsable({ usedAt: now, supersededAt: null, expiresAt: passwordResetExpiresAt(now) }, now)).toBe(false);
  });

  it("is not usable once superseded by a newer link", () => {
    expect(isPasswordResetTokenUsable({ usedAt: null, supersededAt: now, expiresAt: passwordResetExpiresAt(now) }, now)).toBe(false);
  });

  it("is not usable at or after expiry", () => {
    expect(isPasswordResetTokenUsable({ usedAt: null, supersededAt: null, expiresAt: now }, now)).toBe(false);
  });

  it("starts the rate-limit window RATE_LIMIT_WINDOW_MINUTES back", () => {
    expect(now.getTime() - rateLimitWindowStart(now).getTime()).toBe(
      RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    );
  });
});

describe("pruning and locking helpers", () => {
  const now = new Date("2026-11-15T12:00:00.000Z");

  it("keeps logs for PASSWORD_RESET_LOG_RETENTION_DAYS", () => {
    expect(now.getTime() - pruneCutoffs(now).logsBefore.getTime()).toBe(
      PASSWORD_RESET_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("builds a lock name under MySQL's 64-char limit with no email in it", () => {
    const name = passwordResetLockName("ana@example.com");
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).not.toContain("ana");
    expect(name).toBe(passwordResetLockName("ana@example.com"));
  });
});
