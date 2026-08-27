"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAppLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/settings";
import { auth } from "@/lib/auth";
import { clearSessionCookies } from "@/lib/sessionCookie";
import { isTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";
import {
  changePassword as changePasswordRequest,
  endAllSessions,
  updateUserLocale,
  updateUserTheme,
} from "@/lib/userService";
import { firstFieldErrors } from "@/lib/validation/auth";
import { changePasswordSchema, type ProfileActionState } from "@/lib/validation/profile";

/**
 * Persists the current user's preferred locale. Writes it to `User.locale`
 * (so it survives logout/login) and to the `NEXT_LOCALE` cookie (so anonymous
 * pages like login/invite-accept stay in the chosen language), then
 * revalidates the whole layout so the UI language flips in the same roundtrip.
 *
 * @param {ProfileActionState} _prevState - Previous action state (unused).
 * @param {FormData} formData - Submitted form carrying the `locale` value.
 * @returns {Promise<ProfileActionState>} An error key on failure, or empty on success.
 */
export async function updateLocale(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const locale = formData.get("locale");
  if (!isAppLocale(locale)) {
    return { error: "profile.errors.invalidLocale" };
  }

  const result = await updateUserLocale(session.user.id, locale);
  if (!result.ok) {
    return { error: result.error };
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  // Locale drives <html lang> and every translation, so purge the whole client
  // cache and re-render the layout tree with the new language.
  revalidatePath("/", "layout");
  return {};
}

/**
 * Persists the current user's manual light/dark theme override. Writes it to
 * `User.theme` (so the choice survives logout/login on a fresh device) and to
 * the `theme` cookie (device override read on the next SSR). Called directly
 * from `ThemeSelector` after it has already stamped `data-theme` client-side,
 * so it deliberately does **not** revalidate — a re-render would cause a needless
 * reload/flash, and the repaint has already happened.
 *
 * @param {unknown} theme - Candidate theme value from the client (`light`/`dark`).
 * @returns {Promise<ProfileActionState>} An error key on failure, or empty on success.
 */
export async function updateTheme(theme: unknown): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!isTheme(theme)) {
    return { error: "profile.errors.invalidTheme" };
  }

  const result = await updateUserTheme(session.user.id, theme);
  if (!result.ok) {
    return { error: result.error };
  }

  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  return {};
}

/**
 * Ends every session the current user holds, on every device, and sends them
 * back to the login page.
 *
 * This is the application's answer to "someone else may be signed in as me".
 * There was none before: sessions are database rows the app never listed and
 * never deleted, so the only way to end one was an operator running SQL — and
 * doing that used to strand every other user outside the login page.
 *
 * The current session goes with the rest, so signing back in is part of the
 * flow rather than a failure of it.
 *
 * Ends the sessions and clears the cookie directly rather than going through
 * `signOut`: the adapter's `deleteSession` is a bare delete that throws when
 * the row is already gone, and by this point it is.
 *
 * @returns {Promise<void>} Never returns; redirects to `/login`.
 */
export async function closeAllSessions(): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  await endAllSessions(session.user.id);
  clearSessionCookies(await cookies());

  redirect("/login");
}

/**
 * Changes the current user's password and ends every session they hold.
 *
 * The two halves belong together: a database session survives a password
 * change untouched, so replacing the password alone leaves anyone already
 * signed in exactly where they were. Ending the sessions is what turns a new
 * password into actual revocation.
 *
 * @param {ProfileActionState} _prevState - Previous action state (unused).
 * @param {FormData} formData - Submitted form with current, new and confirmed passwords.
 * @returns {Promise<ProfileActionState>} Field/top-level error keys, or never (redirects).
 */
export async function changePassword(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      fieldErrors: firstFieldErrors(z.flattenError(parsed.error).fieldErrors),
    };
  }

  const result = await changePasswordRequest(
    session.user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  if (!result.ok) {
    return { error: result.error };
  }

  // Their own session was among the ones just ended, so there is nothing left
  // to return to.
  clearSessionCookies(await cookies());
  redirect("/login");
}
