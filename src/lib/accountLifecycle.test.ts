import { changePassword, endAllSessions } from "@/lib/userService";
import { prisma } from "@/lib/prisma";

jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    session: { deleteMany: jest.fn() },
  },
}));
jest.mock("@/i18n/server", () => ({ getLocale: jest.fn().mockResolvedValue("es") }));

const findUser = prisma.user.findUnique as jest.Mock;
const updateUser = prisma.user.update as jest.Mock;
const deleteSessions = prisma.session.deleteMany as jest.Mock;

/** A real bcrypt hash of "la-contrasena-de-ahora", generated at cost 10. */
const CURRENT_HASH = "$2b$10$DDL5RzVS/mX8hHxMDE361e8zC9twSYCS7ihY32OxcnvuddRobYlB.";

describe("endAllSessions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Sessions are database rows the app never listed and never deleted, and one
  // that gets used now and then never actually expires, so a session obtained
  // months ago still works.
  it("deletes every session the user holds, this device's included", async () => {
    deleteSessions.mockResolvedValue({ count: 4 });

    await expect(endAllSessions("user-1")).resolves.toEqual({ ok: true, count: 4 });
    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("reports a failure instead of throwing", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    deleteSessions.mockRejectedValue(new Error("db down"));

    await expect(endAllSessions("user-1")).resolves.toEqual({
      ok: false,
      error: "profile.errors.updateFailed",
    });
  });
});

describe("changePassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findUser.mockResolvedValue({ password: CURRENT_HASH });
    updateUser.mockResolvedValue({ id: "user-1" });
    deleteSessions.mockResolvedValue({ count: 3 });
  });

  it("refuses when the current password is wrong", async () => {
    await expect(
      changePassword("user-1", "no-es-esta", "una-contrasena-nueva"),
    ).resolves.toEqual({ ok: false, error: "profile.errors.wrongPassword" });

    expect(updateUser).not.toHaveBeenCalled();
    expect(deleteSessions).not.toHaveBeenCalled();
  });

  it("stores a new hash, never the password itself", async () => {
    await changePassword("user-1", "la-contrasena-de-ahora", "una-contrasena-nueva");

    const stored = updateUser.mock.calls[0][0].data.password;
    expect(stored).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(stored).toHaveLength(60);
    expect(stored).not.toBe("una-contrasena-nueva");
    expect(stored).not.toBe(CURRENT_HASH);
  });

  // This is the half that makes a password change mean anything: a database
  // session survives the change untouched, so without it whoever is already
  // signed in stays signed in and the new password locks out nobody.
  it("ends every session as part of the change", async () => {
    await expect(
      changePassword("user-1", "la-contrasena-de-ahora", "una-contrasena-nueva"),
    ).resolves.toEqual({ ok: true, endedSessions: 3 });

    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("does not end sessions when the password was not replaced", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    updateUser.mockRejectedValue(new Error("db down"));

    await expect(
      changePassword("user-1", "la-contrasena-de-ahora", "una-contrasena-nueva"),
    ).resolves.toEqual({ ok: false, error: "profile.errors.updateFailed" });

    expect(deleteSessions).not.toHaveBeenCalled();
  });
});
