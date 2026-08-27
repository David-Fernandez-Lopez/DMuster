import { changePassword, closeAllSessions } from "@/app/(app)/profile/actions";
import { auth, signOut } from "@/lib/auth";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/sessionCookie";
import { changePassword as changePasswordRequest, endAllSessions } from "@/lib/userService";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

jest.mock("@/lib/auth", () => ({ auth: jest.fn(), signOut: jest.fn() }));
jest.mock("@/lib/userService", () => ({
  changePassword: jest.fn(),
  endAllSessions: jest.fn(),
  updateUserLocale: jest.fn(),
  updateUserTheme: jest.fn(),
}));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    // The real `redirect` never returns; throwing keeps the control flow of the
    // action under test honest.
    throw new Error("NEXT_REDIRECT");
  }),
}));

const session = auth as unknown as jest.Mock;
const cookieStore = cookies as unknown as jest.Mock;
const endSessions = endAllSessions as jest.Mock;
const changeRequest = changePasswordRequest as jest.Mock;
const redirectTo = redirect as unknown as jest.Mock;
const signOutCall = signOut as unknown as jest.Mock;

let deleteCookie: jest.Mock;

/** Builds the FormData a password change submits. */
function passwordForm(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

describe("profile security actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deleteCookie = jest.fn();
    cookieStore.mockResolvedValue({ delete: deleteCookie, set: jest.fn(), get: jest.fn() });
    session.mockResolvedValue({ user: { id: "user-1" } });
    endSessions.mockResolvedValue({ ok: true, count: 3 });
    changeRequest.mockResolvedValue({ ok: true, endedSessions: 3 });
  });

  describe("closeAllSessions", () => {
    it("ends every session and clears the cookie before redirecting", async () => {
      await expect(closeAllSessions()).rejects.toThrow("NEXT_REDIRECT");

      expect(endSessions).toHaveBeenCalledWith("user-1");
      expect(deleteCookie).toHaveBeenCalledWith(SESSION_COOKIE);
      expect(deleteCookie).toHaveBeenCalledWith(SECURE_SESSION_COOKIE);
      expect(redirectTo).toHaveBeenCalledWith("/login");
    });

    // The adapter's `deleteSession` is a bare `delete` that throws P2025 when
    // the row is already gone — and by this point every row is. Routing the
    // sign-out through `signOut` would turn the successful case into a 500.
    it("never calls signOut, whose adapter would throw on the missing row", async () => {
      await expect(closeAllSessions()).rejects.toThrow("NEXT_REDIRECT");

      expect(signOutCall).not.toHaveBeenCalled();
    });
  });

  describe("changePassword", () => {
    const valid = {
      currentPassword: "la-de-ahora",
      newPassword: "una-contrasena-nueva",
      confirmPassword: "una-contrasena-nueva",
    };

    it("clears the cookie and redirects once the change lands", async () => {
      await expect(changePassword({}, passwordForm(valid))).rejects.toThrow("NEXT_REDIRECT");

      expect(changeRequest).toHaveBeenCalledWith("user-1", "la-de-ahora", "una-contrasena-nueva");
      expect(deleteCookie).toHaveBeenCalledWith(SESSION_COOKIE);
      expect(redirectTo).toHaveBeenCalledWith("/login");
      expect(signOutCall).not.toHaveBeenCalled();
    });

    it("reports a mismatched confirmation without touching the password", async () => {
      const state = await changePassword(
        {},
        passwordForm({ ...valid, confirmPassword: "otra-distinta" }),
      );

      expect(state.fieldErrors?.confirmPassword).toBe("auth.errors.passwordMismatch");
      expect(changeRequest).not.toHaveBeenCalled();
    });

    it("rejects a new password that is too short", async () => {
      const state = await changePassword(
        {},
        passwordForm({ ...valid, newPassword: "corta", confirmPassword: "corta" }),
      );

      expect(state.fieldErrors?.newPassword).toBe("auth.errors.passwordTooShort");
      expect(changeRequest).not.toHaveBeenCalled();
    });

    it("rejects reusing the current password", async () => {
      const state = await changePassword(
        {},
        passwordForm({
          currentPassword: "la-misma-de-siempre",
          newPassword: "la-misma-de-siempre",
          confirmPassword: "la-misma-de-siempre",
        }),
      );

      expect(state.fieldErrors?.newPassword).toBe("profile.errors.samePassword");
      expect(changeRequest).not.toHaveBeenCalled();
    });

    it("keeps the session when the current password is wrong", async () => {
      changeRequest.mockResolvedValue({ ok: false, error: "profile.errors.wrongPassword" });

      const state = await changePassword({}, passwordForm(valid));

      expect(state.error).toBe("profile.errors.wrongPassword");
      expect(deleteCookie).not.toHaveBeenCalled();
      expect(redirectTo).not.toHaveBeenCalled();
    });
  });
});
