import { createInstance, type i18n as I18nInstance, type TFunction } from "i18next";
import { cookies } from "next/headers";
import { cache } from "react";
import { initReactI18next } from "react-i18next/initReactI18next";

import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

import {
  type AppLocale,
  getOptions,
  isAppLocale,
  LOCALE_COOKIE,
} from "./settings";

/**
 * Resolves the locale for the current request. Resolution order:
 * authenticated user's profile (`User.locale`) → cookie → default
 * (`env.DEFAULT_LOCALE`). Reading the profile first is what makes a saved
 * language survive logout/login, outranking a stale cookie.
 *
 * Wrapped in React `cache` so it runs once per request. Server actions must not
 * call this (nor `getServerTranslation`) — they return raw i18n keys instead —
 * so the memoized value can never go stale within an action→re-render request.
 *
 * @returns {Promise<AppLocale>} Locale to render the request with.
 */
export const getLocale = cache(async (): Promise<AppLocale> => {
  // Authenticated users: their persisted preference wins over any cookie.
  const session = await auth();
  if (isAppLocale(session?.user?.locale)) {
    return session.user.locale;
  }

  // Anonymous visitors (login/register) fall back to the cookie, then default.
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  return isAppLocale(cookieLocale) ? cookieLocale : env.DEFAULT_LOCALE;
});

/**
 * Creates a per-request i18next instance for server components and returns
 * its translation helpers. A fresh instance is used on every call so
 * concurrent requests with different locales never share state.
 *
 * @param {AppLocale} [locale] - Locale override; defaults to the request locale.
 * @returns {Promise<{ t: TFunction; i18n: I18nInstance; locale: AppLocale }>}
 *   Fixed `t` function, the underlying instance, and the resolved locale.
 */
export async function getServerTranslation(locale?: AppLocale): Promise<{
  t: TFunction;
  i18n: I18nInstance;
  locale: AppLocale;
}> {
  const resolved = locale ?? (await getLocale());
  const i18n = createInstance();

  await i18n.use(initReactI18next).init(getOptions(resolved));

  return { t: i18n.getFixedT(resolved), i18n, locale: resolved };
}
