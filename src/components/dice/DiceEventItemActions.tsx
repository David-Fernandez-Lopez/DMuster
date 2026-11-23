"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import DiceEventFormModal, {
  type DiceEventFormValues,
} from "@/components/dice/DiceEventFormModal";
import type { DiceEventCampaignContext } from "@/lib/diceEventService";

interface DiceEventItemActionsProps {
  /** The entry's current values, to prefill the edit form. */
  event: DiceEventFormValues;
  /** The campaign of the entry (the form only needs that one). */
  campaign: DiceEventCampaignContext;
  /** Id of the signed-in user. */
  viewerId: string;
  /** "YYYY-MM-DD" of today. */
  today: string;
  /**
   * When given, "Edit" calls it instead of opening the form here, so a parent
   * that already shows a modal can swap it for the form.
   */
  onEdit?: () => void;
}

/**
 * Edit and delete controls of one log entry. Any member of the campaign may use
 * both (the API enforces membership). Delete is the usual two-step inline
 * confirmation; a failed delete shows the translated error.
 *
 * @param {DiceEventItemActionsProps} props
 * @returns {JSX.Element}
 */
export default function DiceEventItemActions({
  event,
  campaign,
  viewerId,
  today,
  onEdit,
}: DiceEventItemActionsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /** Sends the delete request and refreshes the list on success. */
  async function handleDelete() {
    setIsPending(true);
    setErrorKey(null);
    try {
      const response = await fetch(`/api/dice-events/${event.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "diceEvents.errors.unknown");
        return;
      }
      router.refresh();
    } catch {
      setErrorKey("diceEvents.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {confirming ? (
        <>
          <p className="text-sm text-ink">{t("diceEvents.confirmDelete")}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="btn btn-no btn-filled min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
            >
              {isPending ? t("common.loading") : t("diceEvents.confirmYes")}
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
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (onEdit ? onEdit() : setEditing(true))}
            className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold"
          >
            {t("diceEvents.edit")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn btn-no min-h-[44px] px-3 text-sm font-semibold"
          >
            {t("diceEvents.delete")}
          </button>
        </div>
      )}
      {errorKey ? (
        <p className="text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
      {editing ? (
        <DiceEventFormModal
          campaigns={[campaign]}
          viewerId={viewerId}
          today={today}
          event={event}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
