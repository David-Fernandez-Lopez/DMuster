/** Supported UI themes for the manual theme override. */
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Cookie holding the manual theme override. When absent, the app follows the
 * operating system preference (`prefers-color-scheme`). Not HttpOnly on purpose:
 * it is written client-side and read on the server to avoid a flash on SSR.
 */
export const THEME_COOKIE = "theme";

/** Theme cookie lifetime, in seconds (one year). */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Narrows an arbitrary value (e.g. a raw cookie value) to a supported theme.
 *
 * @param {unknown} value - Value to check against the supported themes.
 * @returns {boolean} True when the value is one of the supported themes.
 */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}
