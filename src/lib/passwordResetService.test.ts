import { PasswordResetOutcome } from "@/generated/prisma/enums";
import { sendMail } from "@/lib/mailer";
import { hashPassword } from "@/lib/passwordHash";
import {
  hashPasswordResetToken,
  passwordResetLockName,
  RESET_MAX_REQUESTS_PER_EMAIL,
  RESET_MAX_REQUESTS_PER_IP,
} from "@/lib/passwordReset";
import {
  isResetTokenValid,
  requestPasswordReset,
  resetPassword,
} from "@/lib/passwordResetService";
import { prisma } from "@/lib/prisma";

// The generated client is ESM (`import.meta.url`) and ts-jest cannot parse it.
jest.mock("@/generated/prisma/client", () => ({}));
// `@/lib/env` validates process.env on import; only AUTH_URL is read here.
jest.mock("@/lib/env", () => ({ env: { AUTH_URL: "https://dmuster.example/" } }));
jest.mock("@/lib/mailer", () => ({ sendMail: jest.fn() }));
jest.mock("@/lib/passwordHash", () => ({ hashPassword: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    passwordResetLog: { update: jest.fn(), deleteMany: jest.fn() },
    passwordResetToken: { findUnique: jest.fn(), deleteMany: jest.fn() },
  },
}));

type Mocked = jest.Mock;
const db = prisma as unknown as {
  $transaction: Mocked;
  passwordResetLog: { update: Mocked; deleteMany: Mocked };
  passwordResetToken: { findUnique: Mocked; deleteMany: Mocked };
};
const mail = sendMail as Mocked;
const hash = hashPassword as Mocked;

/** Transaction client stub, rebuilt per test so call counts stay isolated. */
let tx: {
  $queryRaw: Mocked;
  passwordResetLog: { create: Mocked; count: Mocked };
  user: { findUnique: Mocked; update: Mocked };
  passwordResetToken: { updateMany: Mocked; create: Mocked };
  session: { deleteMany: Mocked };
};

const NOW_PLUS_HOUR = () => new Date(Date.now() + 60 * 60 * 1000);
const ACTIVE_USER = { id: "user-1", name: "Ana", locale: "es", disabledAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  tx = {
    // First raw query is GET_LOCK, the rest (RELEASE_LOCK) return nothing.
    $queryRaw: jest.fn().mockResolvedValueOnce([{ acquired: BigInt(1) }]).mockResolvedValue([]),
    passwordResetLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }), count: jest.fn().mockResolvedValue(0) },
    user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    passwordResetToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: "token-1" }),
    },
    session: { deleteMany: jest.fn() },
  };
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (client: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
  );
  mail.mockResolvedValue(undefined);
  hash.mockResolvedValue("new-hash");
});

afterEach(() => jest.restoreAllMocks());

/** The outcome written to the log by the (single) request under test. */
function loggedOutcome(): PasswordResetOutcome | undefined {
  return tx.passwordResetLog.create.mock.calls[0]?.[0]?.data?.outcome;
}

describe("requestPasswordReset", () => {
  const request = (email = "  Ana@Example.COM ", ipAddress: string | null = "203.0.113.7") =>
    requestPasswordReset({ email, ipAddress });

  it("logs UNKNOWN_EMAIL and sends nothing for an unknown address", async () => {
    await request();

    expect(loggedOutcome()).toBe(PasswordResetOutcome.UNKNOWN_EMAIL);
    expect(tx.passwordResetLog.create.mock.calls[0][0].data).toMatchObject({
      email: "ana@example.com",
      ipAddress: "203.0.113.7",
    });
    expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("logs DISABLED_ACCOUNT and sends nothing for a disabled account", async () => {
    tx.user.findUnique.mockResolvedValue({ ...ACTIVE_USER, disabledAt: new Date() });

    await request();

    expect(loggedOutcome()).toBe(PasswordResetOutcome.DISABLED_ACCOUNT);
    expect(mail).not.toHaveBeenCalled();
  });

  it("rate-limits by email", async () => {
    tx.user.findUnique.mockResolvedValue(ACTIVE_USER);
    tx.passwordResetLog.count.mockResolvedValueOnce(RESET_MAX_REQUESTS_PER_EMAIL);

    await request();

    expect(loggedOutcome()).toBe(PasswordResetOutcome.RATE_LIMITED);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("rate-limits by IP", async () => {
    tx.passwordResetLog.count.mockResolvedValueOnce(0).mockResolvedValueOnce(RESET_MAX_REQUESTS_PER_IP);

    await request();

    expect(loggedOutcome()).toBe(PasswordResetOutcome.RATE_LIMITED);
  });

  it("does not count RATE_LIMITED rows towards the limit", async () => {
    await request();

    expect(tx.passwordResetLog.count.mock.calls[0][0].where.outcome).toEqual({
      not: PasswordResetOutcome.RATE_LIMITED,
    });
  });

  it("skips the IP limit when the IP is unknown", async () => {
    await request(undefined, null);

    expect(tx.passwordResetLog.count).toHaveBeenCalledTimes(1);
  });

  it("holds and releases the per-email lock", async () => {
    await request();

    const lockName = passwordResetLockName("ana@example.com");
    expect(tx.$queryRaw.mock.calls[0]).toContain(lockName);
    expect(tx.$queryRaw.mock.calls.at(-1)?.[0].join("?")).toMatch(/RELEASE_LOCK/);
    expect(tx.$queryRaw.mock.calls.at(-1)).toContain(lockName);
  });

  it("logs RATE_LIMITED when the lock cannot be taken", async () => {
    tx.$queryRaw.mockReset().mockResolvedValue([{ acquired: BigInt(0) }]);

    await request();

    expect(loggedOutcome()).toBe(PasswordResetOutcome.RATE_LIMITED);
    expect(tx.passwordResetLog.count).not.toHaveBeenCalled();
  });

  describe("for an active account", () => {
    beforeEach(() => tx.user.findUnique.mockResolvedValue(ACTIVE_USER));

    it("supersedes older links, stores a hashed token and logs SENT", async () => {
      await request();

      expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", usedAt: null, supersededAt: null },
        data: { supersededAt: expect.any(Date) },
      });
      expect(tx.passwordResetToken.create.mock.calls[0][0].data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(loggedOutcome()).toBe(PasswordResetOutcome.SENT);
    });

    it("mails a link built from AUTH_URL whose token matches the stored hash", async () => {
      await request();

      expect(mail).toHaveBeenCalledTimes(1);
      const { to, text } = mail.mock.calls[0][0];
      expect(to).toBe("ana@example.com");
      const link = text.match(/https:\/\/dmuster\.example\/reset-password\/(\S+)/);
      expect(link).not.toBeNull();
      expect(hashPasswordResetToken(decodeURIComponent(link![1]))).toBe(
        tx.passwordResetToken.create.mock.calls[0][0].data.tokenHash,
      );
    });

    it("on a send failure, marks the log SEND_FAILED and deletes the token", async () => {
      mail.mockRejectedValue(new Error("smtp down"));

      await expect(request()).resolves.toBeUndefined();

      expect(db.passwordResetLog.update).toHaveBeenCalledWith({
        where: { id: "log-1" },
        data: { outcome: PasswordResetOutcome.SEND_FAILED },
      });
      expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { id: "token-1" } });
    });
  });

  it("never throws on an internal error, and still prunes", async () => {
    tx.passwordResetLog.count.mockRejectedValue(new Error("db down"));

    await expect(request()).resolves.toBeUndefined();
    expect(db.passwordResetLog.deleteMany).toHaveBeenCalled();
  });

  it("prunes old logs and long-expired tokens", async () => {
    await request();

    expect(db.passwordResetLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
    expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});

describe("resetPassword", () => {
  /** Arranges the token the lookup will find. */
  function token(overrides: Record<string, unknown> = {}): void {
    db.passwordResetToken.findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      usedAt: null,
      supersededAt: null,
      expiresAt: NOW_PLUS_HOUR(),
      user: { disabledAt: null },
      ...overrides,
    });
  }
  const reset = () => resetPassword({ rawToken: "raw", password: "una-contrasena-larga" });
  const INVALID = { ok: false, error: "passwordReset.errors.invalidToken" };

  it("refuses an unknown token", async () => {
    db.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(reset()).resolves.toEqual(INVALID);
  });

  it.each([
    ["used", { usedAt: new Date() }],
    ["superseded", { supersededAt: new Date() }],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["for a disabled account", { user: { disabledAt: new Date() } }],
  ])("refuses a token that is %s", async (_label, overrides) => {
    token(overrides);

    await expect(reset()).resolves.toEqual(INVALID);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("changes nothing when a concurrent submission claimed the token first", async () => {
    token();
    tx.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(reset()).resolves.toEqual(INVALID);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("sets the password, voids other links and signs out everywhere", async () => {
    token();

    await expect(reset()).resolves.toEqual({ ok: true });

    expect(tx.passwordResetToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "token-1", usedAt: null, supersededAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { password: "new-hash" } });
    expect(tx.passwordResetToken.updateMany).toHaveBeenNthCalledWith(2, {
      where: { userId: "user-1", usedAt: null, supersededAt: null },
      data: { supersededAt: expect.any(Date) },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("returns the generic error when the database fails", async () => {
    db.passwordResetToken.findUnique.mockRejectedValue(new Error("db down"));
    await expect(reset()).resolves.toEqual({ ok: false, error: "passwordReset.errors.unknown" });
  });
});

describe("isResetTokenValid", () => {
  it("accepts a redeemable token", async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      usedAt: null,
      supersededAt: null,
      expiresAt: NOW_PLUS_HOUR(),
      user: { disabledAt: null },
    });
    await expect(isResetTokenValid("raw")).resolves.toBe(true);
  });

  it("rejects a superseded token", async () => {
    db.passwordResetToken.findUnique.mockResolvedValue({
      usedAt: null,
      supersededAt: new Date(),
      expiresAt: NOW_PLUS_HOUR(),
      user: { disabledAt: null },
    });
    await expect(isResetTokenValid("raw")).resolves.toBe(false);
  });
});
