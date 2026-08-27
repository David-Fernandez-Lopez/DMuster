"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface RemoveHolidayButtonProps {
  holidayId: string;
}

/**
 * Two-step inline control that removes a holiday.
 *
 * It used to remove on the first tap, on the reasoning that re-adding one is a
 * single tap in the form below. That reasoning only holds for the person
 * tapping: holidays are global, so a mis-tap takes the day away from every
 * campaign in the instance, and any campaign that had already confirmed a
 * session on it is left unable to confirm that date again. The confirmation
 * step, and the sentence it shows, are what make the reach of the action
 * visible before it happens rather than after.
 *
 * A refused removal (a session still depends on the date → 400, the DM role
 * lost mid-session → 403, already deleted → 404) shows the translated reason
 * and keeps the row.
 *
 * @param {RemoveHolidayButtonProps} props - The holiday to remove.
 * @returns {JSX.Element} The remove control.
 */
export default function RemoveHolidayButton({
  holidayId,
}: RemoveHolidayButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Sends the delete request and, on success, refreshes the list so the row
   * disappears. On failure it keeps the row visible and shows the error.
   */
  async function handleRemove() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/holidays/${holidayId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "holidays.errors.unknown");
        return;
      }

      router.refresh();
    } catch {
      setErrorKey("holidays.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-no min-h-[44px] shrink-0 px-3 text-sm font-semibold"
      >
        {t("holidays.remove")}
      </button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <p className="text-right text-sm text-ink">{t("holidays.confirmRemove")}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="btn btn-no btn-filled min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("holidays.confirmRemoveYes")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
      </div>
      {errorKey ? (
        <p className="text-right text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
