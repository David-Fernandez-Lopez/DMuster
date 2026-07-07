"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface RemovePlayerButtonProps {
  campaignId: string;
  userId: string;
}

/**
 * Inline control that removes a member from a campaign. Re-adding a player is a
 * single tap in the picker below, so removal needs no confirmation step. A
 * failed removal (e.g. the last DM, or the DM role lost mid-session → 403)
 * surfaces a translated error and keeps the row visible.
 *
 * @param {RemovePlayerButtonProps} props - The campaign and member to remove.
 * @returns {JSX.Element} The remove control.
 */
export default function RemovePlayerButton({
  campaignId,
  userId,
}: RemovePlayerButtonProps) {
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
      const response = await fetch(`/api/campaigns/${campaignId}/players`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "campaigns.errors.unknown");
        return;
      }

      router.refresh();
    } catch {
      setErrorKey("campaigns.errors.unknown");
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
        {isPending ? t("common.loading") : t("campaigns.players.remove")}
      </button>
      {errorKey ? (
        <p className="text-right text-xs text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
