"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ArchiveCampaignButtonProps {
  campaignId: string;
  /** Whether the campaign is archived now: the control then unarchives. */
  archived: boolean;
}

/**
 * Archive / unarchive control for a campaign. Archiving is two-step like
 * `DeleteCampaignButton` (the first tap reveals an inline confirmation);
 * unarchiving is harmless and happens in one tap. A refused request (upcoming
 * sessions still active, DM role lost) surfaces its translated error.
 *
 * @param {ArchiveCampaignButtonProps} props - The campaign and its current state.
 * @returns {JSX.Element} The control.
 */
export default function ArchiveCampaignButton({
  campaignId,
  archived,
}: ArchiveCampaignButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /** Sends the archive (POST) or unarchive (DELETE) request, then refreshes. */
  async function handleChange() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/archive`, {
        method: archived ? "DELETE" : "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "campaigns.errors.unknown");
        setConfirming(false);
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch {
      setErrorKey("campaigns.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {archived || !confirming ? (
        <button
          type="button"
          onClick={archived ? handleChange : () => setConfirming(true)}
          disabled={isPending}
          className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {archived
            ? isPending
              ? t("common.loading")
              : t("campaigns.actions.unarchive")
            : t("campaigns.actions.archive")}
        </button>
      ) : (
        <>
          <p className="text-sm text-ink">
            {t("campaigns.actions.confirmArchive")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleChange}
              disabled={isPending}
              className="btn btn-primary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
            >
              {isPending
                ? t("common.loading")
                : t("campaigns.actions.confirmArchiveYes")}
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
        </>
      )}
      {errorKey ? (
        <p className="text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
