import bcrypt from "bcryptjs";

import { Prisma } from "@/generated/prisma/client";
import { getLocale } from "@/i18n/server";
import type { AppLocale } from "@/i18n/settings";
import { prisma } from "@/lib/prisma";
import type { Theme } from "@/lib/theme";

/** Bcrypt cost factor. Kept in sync with the seed script (prisma/seed.ts). */
const BCRYPT_COST = 10;

/** Prisma error code raised on a unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/** Payload to create a new user account. */
export type CreateUserInput = { name: string; email: string; password: string };

/** Result of a registration attempt. `error` holds an i18n key on failure. */
export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Creates a new user account. The password is hashed with bcrypt and the new
 * user's locale is taken from the current request locale. A duplicate email
 * surfaces as a friendly i18n error key rather than throwing.
 *
 * Internal path only — not reachable from any public route since roadmap #24
 * removed public registration. Its only caller is
 * `invitationService.acceptInvitation`, which passes its transaction client so
 * the new user and the invitation are consumed atomically.
 *
 * @param {CreateUserInput} input - Name, email and plaintext password.
 * @param {Prisma.TransactionClient | typeof prisma} [client] - Prisma client to
 *   run the write against; pass a `$transaction` callback's `tx` to make the
 *   write participate in a larger transaction. Defaults to the module client.
 * @returns {Promise<RegisterResult>} Success with the new user id, or an
 *   error key (`auth.errors.emailTaken` / `auth.errors.unknown`).
 */
export async function registerUser(
  input: CreateUserInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();

  try {
    const locale = await getLocale();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    const user = await client.user.create({
      data: {
        name: input.name.trim(),
        email,
        password: passwordHash,
        locale,
      },
      select: { id: true },
    });

    return { ok: true, userId: user.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      return { ok: false, error: "auth.errors.emailTaken" };
    }

    console.error("[AUTH/REGISTER] Failed to create user:", error);
    return { ok: false, error: "auth.errors.unknown" };
  }
}

/** Result of a locale update. `error` holds an i18n key on failure. */
export type UpdateLocaleResult = { ok: true } | { ok: false; error: string };

/**
 * Persists a user's preferred locale to their profile. Failures are logged
 * server-side and returned as a friendly i18n error key rather than thrown.
 *
 * @param {string} userId - Id of the user whose locale is being updated.
 * @param {AppLocale} locale - New locale to persist.
 * @returns {Promise<UpdateLocaleResult>} Success, or an error key
 *   (`profile.errors.updateFailed`).
 */
export async function updateUserLocale(
  userId: string,
  locale: AppLocale,
): Promise<UpdateLocaleResult> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { locale },
      select: { id: true },
    });

    return { ok: true };
  } catch (error) {
    console.error("[PROFILE/UPDATE_LOCALE] Failed to update user locale:", error);
    return { ok: false, error: "profile.errors.updateFailed" };
  }
}

/** Result of a theme update. `error` holds an i18n key on failure. */
export type UpdateThemeResult = { ok: true } | { ok: false; error: string };

/**
 * Persists a user's manual light/dark theme override to their profile so the
 * choice survives logout/login on a fresh device. Failures are logged
 * server-side and returned as a friendly i18n error key rather than thrown.
 *
 * @param {string} userId - Id of the user whose theme is being updated.
 * @param {Theme} theme - New theme to persist (`light` or `dark`).
 * @returns {Promise<UpdateThemeResult>} Success, or an error key
 *   (`profile.errors.updateFailed`).
 */
export async function updateUserTheme(
  userId: string,
  theme: Theme,
): Promise<UpdateThemeResult> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { theme },
      select: { id: true },
    });

    return { ok: true };
  } catch (error) {
    console.error("[PROFILE/UPDATE_THEME] Failed to update user theme:", error);
    return { ok: false, error: "profile.errors.updateFailed" };
  }
}

/** Result of ending a user's sessions. `error` holds an i18n key on failure. */
export type EndSessionsResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Deletes every session row belonging to a user, signing them out of every
 * device at once — the one they are using included.
 *
 * Sessions live in the database and never expire in practice: the window slides
 * forward on use, so an account that gets opened once a month stays valid
 * indefinitely, and each sign-in adds a row without clearing the previous ones.
 * Changing a password does not touch any of that on its own, which is why the
 * password change calls this too: without it, someone else who is already
 * signed in stays signed in, and the new password locks out nobody.
 *
 * Kept whole rather than "everywhere except here": a person reaching for this
 * does not know which of the live sessions are theirs, and leaving one behind
 * defeats the point. Signing back in afterwards is the confirmation that the
 * account is theirs again.
 *
 * @param {string} userId - Id of the user whose sessions are being ended.
 * @returns {Promise<EndSessionsResult>} How many sessions were ended, or an
 *   error key (`profile.errors.updateFailed`).
 */
export async function endAllSessions(userId: string): Promise<EndSessionsResult> {
  try {
    const result = await prisma.session.deleteMany({ where: { userId } });

    return { ok: true, count: result.count };
  } catch (error) {
    console.error("[PROFILE/END_SESSIONS] Failed to end sessions:", error);
    return { ok: false, error: "profile.errors.updateFailed" };
  }
}

/** Result of a password change. `error` holds an i18n key on failure. */
export type ChangePasswordResult =
  | { ok: true; endedSessions: number }
  | { ok: false; error: string };

/**
 * Replaces a user's password, after checking the one they currently hold, and
 * ends every one of their sessions.
 *
 * Until now the application had no way to change a password at all: the only
 * route to it was an `UPDATE` run by hand against the database, which also left
 * every live session untouched. So an account known to be compromised could not
 * actually be taken back — the new password guarded the login form while the
 * old cookie walked straight past it.
 *
 * The current password is required so that a browser left open on someone
 * else's screen cannot be used to lock its owner out.
 *
 * @param {string} userId - Id of the user changing their password.
 * @param {string} currentPassword - The password they hold today.
 * @param {string} newPassword - The password to set.
 * @returns {Promise<ChangePasswordResult>} How many sessions were ended, or an
 *   error key (`profile.errors.wrongPassword` / `profile.errors.updateFailed`).
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) {
      return { ok: false, error: "profile.errors.updateFailed" };
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.password);
    if (!currentMatches) {
      return { ok: false, error: "profile.errors.wrongPassword" };
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
      select: { id: true },
    });

    // Deliberately outside the update's success path rather than inside a
    // transaction: if the sessions somehow survive, the password has still
    // changed, and the caller is told how many were ended so a zero is visible.
    const ended = await endAllSessions(userId);

    return { ok: true, endedSessions: ended.ok ? ended.count : 0 };
  } catch (error) {
    console.error("[PROFILE/CHANGE_PASSWORD] Failed to change password:", error);
    return { ok: false, error: "profile.errors.updateFailed" };
  }
}
