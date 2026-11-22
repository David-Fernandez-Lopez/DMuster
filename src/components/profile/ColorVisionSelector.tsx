"use client";

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateColorVision } from "@/app/(app)/profile/actions";
import { COLOR_VISIONS, isColorVision, type ColorVision } from "@/lib/colorVision";

/** The select's value for "regular colours" (no palette). */
const OFF = "off";

/**
 * Settings row with a select for the colour-blind palette: off, or the vision
 * type it is tuned for (protanopia, deuteranopia, tritanopia, or "all" when the
 * user does not know). The repaint is optimistic: an effect stamps (or removes)
 * `data-color-vision` on <html>, and the choice is persisted to
 * `User.colorVision` via the `updateColorVision` server action; a failure puts
 * the previous value back and shows the error. Mirrors `HorizonSelector`.
 *
 * @param {{ initialValue: ColorVision | null }} props - The persisted preference.
 * @returns {JSX.Element} The colour-vision row.
 */
export default function ColorVisionSelector({
  initialValue,
}: {
  initialValue: ColorVision | null;
}) {
  const { t } = useTranslation();
  const selectId = useId();
  const [value, setValue] = useState<ColorVision | null>(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) {
      document.documentElement.dataset.colorVision = value;
    } else {
      delete document.documentElement.dataset.colorVision;
    }
  }, [value]);

  /**
   * Applies a pick: repaints at once, persists, and reverts on failure.
   *
   * @param {string} raw - The raw `<option>` value the user picked.
   * @returns {void}
   */
  function handleChange(raw: string): void {
    const next = isColorVision(raw) ? raw : null;
    const previous = value;
    setValue(next);
    setError(null);
    void updateColorVision(next)
      .then((result) => {
        if (result.error) {
          setValue(previous);
          setError(result.error);
        }
      })
      .catch(() => {
        setValue(previous);
        setError("profile.errors.updateFailed");
      });
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={selectId} className="font-medium text-ink">
            {t("profile.colorVision.label")}
          </label>
          <p className="text-sm text-ink-muted">{t("profile.colorVision.description")}</p>
        </div>
        <select
          id={selectId}
          value={value ?? OFF}
          onChange={(event) => handleChange(event.target.value)}
          className="min-h-[44px] max-w-[55%] shrink-0 rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink"
        >
          <option value={OFF}>{t("profile.colorVision.off")}</option>
          {COLOR_VISIONS.map((option) => (
            <option key={option} value={option}>
              {t(`profile.colorVision.${option}`)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-n" role="alert">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
