"use client";

import { useId, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";

import { updateAvailabilityHorizon } from "@/app/(app)/availability/actions";
import {
  AVAILABILITY_HORIZON_OPTIONS,
  type AvailabilityHorizon,
  DEFAULT_AVAILABILITY_HORIZON,
  isAvailabilityHorizon,
} from "@/lib/availabilityHorizon";

/**
 * "Mostrar" select of the "Mi disponibilidad" list: how many months it covers,
 * the current one included. The smallest option is the default window, so a
 * user can only widen the list. The choice is saved to the profile through the
 * `updateAvailabilityHorizon` server action, which revalidates the page; the
 * new range then arrives as a fresh server render.
 *
 * The select shows the new value at once and puts the previous one back if the
 * save fails — on the error result and on a throw alike, as `ThemeSelector`
 * does — so it never claims a range the server was not told about.
 *
 * @param {{ initialHorizon: AvailabilityHorizon }} props - The user's saved horizon.
 * @returns {JSX.Element} The labelled select, plus an alert on failure.
 */
export default function HorizonSelector({
  initialHorizon,
}: {
  initialHorizon: AvailabilityHorizon;
}) {
  const { t } = useTranslation();
  const selectId = useId();
  const [horizon, setHorizon] = useState<AvailabilityHorizon>(initialHorizon);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Saves the picked horizon, reverting the select if the save fails.
   *
   * @param {string} value - The raw `<option>` value the user picked.
   * @returns {void}
   */
  function handleChange(value: string): void {
    const months = Number(value);
    if (!isAvailabilityHorizon(months)) {
      return;
    }

    const previous = horizon;
    setHorizon(months);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateAvailabilityHorizon(months);
        if (result.error) {
          setHorizon(previous);
          setError(result.error);
        }
      } catch {
        setHorizon(previous);
        setError("availability.errors.unknown");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm font-medium text-ink">
          {t("availability.horizon.label")}
        </label>
        <select
          id={selectId}
          value={horizon}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.value)}
          className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-ink disabled:opacity-60"
        >
          {AVAILABILITY_HORIZON_OPTIONS.map((months) => (
            <option key={months} value={months}>
              {months === DEFAULT_AVAILABILITY_HORIZON
                ? t("availability.horizon.default", { count: months })
                : t("availability.horizon.option", { count: months })}
            </option>
          ))}
        </select>
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
