"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { updateTheme } from "@/app/(app)/profile/actions";
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
 * Settings row with a Light/Dark segmented control. The visual change is applied
 * client-side for an instant repaint: an effect stamps `data-theme` on <html>
 * and writes the `theme` cookie, which the root layout reads on the next SSR to
 * avoid a flash. In parallel it persists the choice to `User.theme` via the
 * `updateTheme` server action so it survives logout/login on a fresh device
 * (the layout seeds `data-theme` from the DB when the cookie is absent). When
 * the user has not chosen a theme (no cookie), the active segment reflects the
 * OS preference.
 *
 * @param {{ initialTheme: Theme | null }} props - Theme resolved on the server
 *   (cookie, else persisted `User.theme`), or null when following the OS.
 * @returns {JSX.Element} The theme selector row.
 */
export default function ThemeSelector({
  initialTheme,
}: {
  initialTheme: Theme | null;
}) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme | null>(initialTheme);
  const [error, setError] = useState<string | null>(null);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerSystemTheme,
  );
  const active = theme ?? systemTheme;

  // Apply the chosen theme to the DOM + cookie for an instant, flash-free repaint.
  useEffect(() => {
    if (!theme) {
      return;
    }
    document.documentElement.dataset.theme = theme;
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }, [theme]);

  /**
   * Selects a theme: repaint happens via the effect above; here we also persist
   * it to the user's profile for cross-device durability, surfacing any error.
   *
   * @param {Theme} option - The theme the user tapped.
   * @returns {void}
   */
  function handleSelect(option: Theme): void {
    setTheme(option);
    setError(null);
    void updateTheme(option).then((result) => {
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
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
                onClick={() => handleSelect(option)}
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

      {error ? (
        <p
          className="mt-2 rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n"
          role="alert"
        >
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
