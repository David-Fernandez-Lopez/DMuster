"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface CancelSessionButtonProps {
  sessionId: string;
}

/**
 * Two-step inline control to cancel a confirmed session (soft delete — the row
 * survives with `cancelledAt` set). Mirrors `DeleteCampaignButton`: the first
 * tap reveals an inline confirmation row instead of a native `confirm()`
 * dialog, consistent with the rest of the app. Shared by the day modal's
 * campaign card and the "Próximas partidas" session card. A failed cancel
 * (e.g. the DM role was lost mid-session → 403, or it was already cancelled →
 * 404) surfaces a translated error and keeps the row visible.
 *
 * @param {CancelSessionButtonProps} props - The session to cancel.
 * @returns {JSX.Element} The cancel control.
 */
export default function CancelSessionButton({
  sessionId,
}: CancelSessionButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Sends the cancel request and, on success, refreshes so the session's
   * confirmed state disappears from the calendar, the day modal and the
   * "Próximas partidas" list.
   */
  async function handleCancel() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "sessions.errors.unknown");
        return;
      }

      router.refresh();
    } catch {
      setErrorKey("sessions.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-no min-h-[44px] w-full text-sm font-semibold"
      >
        {t("sessions.cancel")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">{t("sessions.cancelConfirmPrompt")}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="btn btn-no btn-filled min-h-[44px] flex-1 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("sessions.cancelYes")}
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
