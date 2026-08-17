"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface DeleteCampaignButtonProps {
  campaignId: string;
}

/**
 * Two-step inline delete control for a campaign (no modal). The first tap
 * reveals a confirmation row; confirming issues a `DELETE` to the campaigns
 * API and refreshes the server-rendered list. A failed delete (e.g. the user
 * lost the DM role mid-session → 403) surfaces a translated error.
 *
 * @param {DeleteCampaignButtonProps} props - The campaign to delete.
 * @returns {JSX.Element} The delete control.
 */
export default function DeleteCampaignButton({
  campaignId,
}: DeleteCampaignButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Sends the delete request and, on success, refreshes the list so the card
   * disappears. On failure it keeps the row visible and shows the error.
   */
  async function handleDelete() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
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

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-no min-h-[44px] px-3 text-sm font-semibold"
      >
        {t("campaigns.actions.delete")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">{t("campaigns.actions.confirmDelete")}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="btn btn-no btn-filled min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("campaigns.actions.confirmYes")}
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
        <p className="text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
