"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface LeaveCampaignButtonProps {
  campaignId: string;
  /** The signed-in user, who is both the actor and the target of the removal. */
  userId: string;
}

/**
 * Two-step inline control for leaving a campaign, mirroring
 * `DeleteCampaignButton`. Unlike a DM removing a player — undone with one tap
 * in the picker — leaving cannot be undone by the person who did it: only a DM
 * of that campaign can add them back. That asymmetry is why this asks first.
 *
 * A campaign's only DM is refused by the API and shown the translated reason,
 * since leaving would strand the campaign with nobody able to manage it.
 *
 * @param {LeaveCampaignButtonProps} props - The campaign and the leaving user.
 * @returns {JSX.Element} The leave control.
 */
export default function LeaveCampaignButton({
  campaignId,
  userId,
}: LeaveCampaignButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Sends the removal and, on success, refreshes the list so the card
   * disappears. On failure it keeps the card and shows the reason.
   */
  async function handleLeave() {
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

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold"
      >
        {t("campaigns.actions.leave")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">{t("campaigns.actions.confirmLeave")}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleLeave}
          disabled={isPending}
          className="btn btn-no btn-filled min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("campaigns.actions.confirmLeaveYes")}
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
