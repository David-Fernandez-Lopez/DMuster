"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface AlwaysOptionalToggleProps {
  campaignId: string;
  userId: string;
  /** Whether the player is currently always optional. */
  alwaysOptional: boolean;
}

/**
 * Inline "Siempre opcional" switch on a player's row of the campaign players
 * page (roadmap #25.2): a player who comes and goes, whose answer never
 * blocks the campaign on its own — unlike the next-session requirements, it
 * never expires. Saves on tap through `PUT /api/campaigns/[id]/players` and
 * refreshes the list; a refusal (e.g. the last required player) surfaces a
 * translated error under the switch.
 *
 * @param {AlwaysOptionalToggleProps} props - The campaign, the player and their current state.
 * @returns {JSX.Element} The switch.
 */
export default function AlwaysOptionalToggle({
  campaignId,
  userId,
  alwaysOptional,
}: AlwaysOptionalToggleProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /** Sends the flipped state and refreshes the list on success. */
  async function handleToggle() {
    setIsPending(true);
    setErrorKey(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/players`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, alwaysOptional: !alwaysOptional }),
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
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={alwaysOptional}
        className="flex min-h-[44px] items-center gap-2 rounded-[var(--radius-control)] px-1 text-left text-xs text-ink-muted transition-colors hover:bg-brand-soft disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none ${
            alwaysOptional ? "border-brand bg-brand text-bg-elevated" : "border-border"
          }`}
        >
          {alwaysOptional ? "✓" : ""}
        </span>
        {t("campaigns.players.alwaysOptional")}
      </button>
      {errorKey ? (
        <p className="text-xs text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
