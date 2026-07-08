"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface RemoveHolidayButtonProps {
  holidayId: string;
}

/**
 * Inline control that removes a holiday. Re-adding a holiday is a single tap in
 * the form below, so removal needs no confirmation step. A failed removal (e.g.
 * the DM role lost mid-session → 403, or already deleted → 404) surfaces a
 * translated error and keeps the row visible.
 *
 * @param {RemoveHolidayButtonProps} props - The holiday to remove.
 * @returns {JSX.Element} The remove control.
 */
export default function RemoveHolidayButton({
  holidayId,
}: RemoveHolidayButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
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

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="min-h-[44px] rounded-[var(--radius-control)] border border-border px-3 text-sm font-semibold text-n transition-colors hover:bg-n-soft disabled:opacity-60"
      >
        {isPending ? t("common.loading") : t("holidays.remove")}
      </button>
      {errorKey ? (
        <p className="text-right text-xs text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
