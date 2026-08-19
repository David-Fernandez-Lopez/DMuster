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
