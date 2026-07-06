"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEMES,
  type Theme,
} from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Subscribes to OS color-scheme changes for `useSyncExternalStore`.
 *
 * @param {() => void} onChange - Callback invoked when the preference changes.
 * @returns {() => void} Unsubscribe function.
 */
function subscribeSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Current OS color-scheme preference (client snapshot). */
function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Server snapshot: the OS preference is unknown until the client mounts. */
function getServerSystemTheme(): Theme {
  return "light";
}

/**
 * Settings row with a Light/Dark segmented control. Theme is purely visual, so
 * changes are applied client-side with no server roundtrip: an effect stamps
 * `data-theme` on <html> (instant repaint) and writes the `theme` cookie, which
 * the root layout reads on the next SSR to avoid a flash. When the user has not
 * chosen a theme (no cookie), the active segment reflects the OS preference.
 *
 * @param {{ initialTheme: Theme | null }} props - Theme resolved from the cookie
 *   on the server, or null when the user follows the OS preference.
 * @returns {JSX.Element} The theme selector row.
 */
export default function ThemeSelector({
  initialTheme,
}: {
  initialTheme: Theme | null;
}) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme | null>(initialTheme);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerSystemTheme,
  );
  const active = theme ?? systemTheme;

  // Apply and persist the chosen theme (external systems: DOM + cookie).
  useEffect(() => {
    if (!theme) {
      return;
    }
    document.documentElement.dataset.theme = theme;
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }, [theme]);

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="font-medium text-ink">{t("profile.theme.label")}</span>
      <div
        role="group"
        aria-label={t("profile.theme.label")}
        className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-border"
      >
        {THEMES.map((option) => {
          const isActive = active === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isActive}
              onClick={() => setTheme(option)}
              className={`min-h-[44px] px-4 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-brand text-bg-elevated"
                  : "text-ink hover:bg-brand-soft"
              }`}
            >
              {t(`profile.theme.${option}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
