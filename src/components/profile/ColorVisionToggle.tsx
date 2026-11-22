"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateColorBlindMode } from "@/app/(app)/profile/actions";

/**
 * Settings row with an On/Off segmented control for the colour-blind-safe
 * palette. The repaint is optimistic: an effect stamps (or removes)
 * `data-color-vision="safe"` on <html>, and the choice is persisted to
 * `User.colorBlindMode` via the `updateColorBlindMode` server action; a failure
 * puts the previous value back and shows the error. Mirrors `ThemeSelector`.
 *
 * @param {{ initialEnabled: boolean }} props - The persisted preference.
 * @returns {JSX.Element} The colour-blind mode row.
 */
export default function ColorVisionToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) {
      document.documentElement.dataset.colorVision = "safe";
    } else {
      delete document.documentElement.dataset.colorVision;
    }
  }, [enabled]);

  /**
   * Applies a tap: repaints at once, persists, and reverts on failure.
   *
   * @param {boolean} option - The value the user tapped.
   * @returns {void}
   */
  function handleSelect(option: boolean): void {
    if (option === enabled) return;
    const previous = enabled;
    setEnabled(option);
    setError(null);
    void updateColorBlindMode(option)
      .then((result) => {
        if (result.error) {
          setEnabled(previous);
          setError(result.error);
        }
      })
      .catch(() => {
        setEnabled(previous);
        setError("profile.errors.updateFailed");
      });
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="font-medium text-ink">{t("profile.colorVision.label")}</span>
          <p className="text-sm text-ink-muted">{t("profile.colorVision.description")}</p>
        </div>
        <div
          role="group"
          aria-label={t("profile.colorVision.label")}
          className="inline-flex shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-border"
        >
          {([true, false] as const).map((option) => {
            const isActive = enabled === option;
            return (
              <button
                key={String(option)}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelect(option)}
                className={`min-h-[44px] px-4 text-sm font-semibold transition-colors ${
                  isActive ? "bg-brand text-bg-elevated" : "text-ink hover:bg-brand-soft"
                }`}
              >
                {t(option ? "profile.colorVision.on" : "profile.colorVision.off")}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-n" role="alert">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
