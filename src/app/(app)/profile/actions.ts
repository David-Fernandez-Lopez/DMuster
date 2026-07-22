"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAppLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/settings";
import { auth } from "@/lib/auth";
import { isTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";
import { updateUserLocale, updateUserTheme } from "@/lib/userService";
import type { ProfileActionState } from "@/lib/validation/profile";

/**
 * Persists the current user's preferred locale. Writes it to `User.locale`
 * (so it survives logout/login) and to the `NEXT_LOCALE` cookie (so anonymous
 * pages like login/register stay in the chosen language), then revalidates the
 * whole layout so the UI language flips in the same roundtrip.
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
