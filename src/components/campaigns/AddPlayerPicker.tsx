"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AssignableUser } from "@/lib/campaignPlayerService";

interface AddPlayerPickerProps {
  campaignId: string;
  /** Registered users not yet in the campaign, ordered by name. */
  candidates: AssignableUser[];
}

/**
 * DM control for adding players to a campaign. Collapsed to a single button; once
 * open it lists every registered user not already in the campaign as a
 * dashed-border chip. Tapping one adds it as a player and refreshes the
 * server-rendered roster (which also drops it from this picker). A failed add
 * surfaces a translated error.
 *
 * @param {AddPlayerPickerProps} props - The campaign and the assignable users.
 * @returns {JSX.Element} The add-player control.
 */
export default function AddPlayerPicker({
  campaignId,
  candidates,
}: AddPlayerPickerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Adds the given user to the campaign and, on success, refreshes the roster.
   * On failure it keeps the picker open and shows the error.
   *
   * @param {string} userId - Id of the user to add.
   */
  async function handleAdd(userId: string) {
    setPendingUserId(userId);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/players`, {
        method: "POST",
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
      setPendingUserId(null);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft"
      >
        + {t("campaigns.players.add")}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
      {candidates.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {t("campaigns.players.noneToAdd")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {candidates.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleAdd(user.id)}
              disabled={pendingUserId !== null}
              className="min-h-[44px] rounded-[var(--radius-control)] border border-dashed border-border px-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-soft disabled:opacity-60"
            >
              {pendingUserId === user.id ? t("common.loading") : user.name}
            </button>
          ))}
        </div>
      )}

      {errorKey ? (
        <p className="mt-3 text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
