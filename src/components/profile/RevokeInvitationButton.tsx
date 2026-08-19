"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface RevokeInvitationButtonProps {
  invitationId: string;
}

/**
 * Two-step inline control to revoke a pending invitation. Mirrors
 * `CancelSessionButton`: the first tap reveals an inline confirmation row
 * instead of a native `confirm()` dialog. A failed revoke (e.g. it was just
 * accepted) surfaces a translated error and keeps the row visible.
 *
 * @param {RevokeInvitationButtonProps} props - The invitation to revoke.
 * @returns {JSX.Element} The revoke control.
 */
export default function RevokeInvitationButton({
  invitationId,
}: RevokeInvitationButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Sends the revoke request and, on success, refreshes so the invitation's
   * status flips in the list.
   */
  async function handleRevoke() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "invitations.errors.unknown");
        return;
      }

      router.refresh();
    } catch {
      setErrorKey("invitations.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn btn-no min-h-[36px] px-3 text-xs font-semibold"
      >
        {t("invitations.revoke")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs text-ink">{t("invitations.revokePrompt")}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRevoke}
          disabled={isPending}
          className="btn btn-no btn-filled min-h-[36px] flex-1 text-xs font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("invitations.revoke")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="btn btn-secondary min-h-[36px] px-3 text-xs font-semibold disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
      </div>
      {errorKey ? (
        <p className="text-xs text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
