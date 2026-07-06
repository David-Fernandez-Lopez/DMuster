import type { InitOptions, Resource } from "i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";

export const LOCALES = ["es", "en"] as const;

export type AppLocale = (typeof LOCALES)[number];

/**
 * Client-safe default locale. Must stay in sync with the authoritative
 * server-side default (`env.DEFAULT_LOCALE` in `src/lib/env.ts`).
 */
export const DEFAULT_LOCALE: AppLocale = "es";

export const DEFAULT_NAMESPACE = "translation";

/** Cookie holding the visitor's preferred locale. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Locale cookie lifetime, in seconds (one year). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Translation resources bundled statically (no fs/backend needed). */
export const resources: Resource = {
  es: { [DEFAULT_NAMESPACE]: es },
  en: { [DEFAULT_NAMESPACE]: en },
};

/**
 * Narrows an arbitrary value (e.g. a raw cookie value) to a supported
 * application locale.
 *
 * @param {unknown} value - Value to check against the supported locales.
 * @returns {boolean} True when the value is one of the supported locales.
 */
export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && LOCALES.includes(value as AppLocale);
}

/**
 * Builds the i18next init options for a given locale. Resources are bundled
 * statically and `initAsync` is disabled, so `init` and `changeLanguage`
 * resolve synchronously — avoiding hydration mismatches between server and
 * client renders.
 *
 * @param {AppLocale} locale - Locale the instance should start with.
 * @returns {InitOptions} Options ready to pass to `i18next.init`.
 */
export function getOptions(locale: AppLocale): InitOptions {
  return {
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    defaultNS: DEFAULT_NAMESPACE,
    ns: [DEFAULT_NAMESPACE],
    interpolation: { escapeValue: false },
    initAsync: false,
  };
}
