"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RequirementsWindow } from "@/lib/campaignRequirements";
import type { RequirementsPlayer } from "@/lib/campaignRequirementsService";
import { toUtcDate } from "@/lib/date";

interface CampaignRequirementsFormProps {
  /** The campaign being configured. */
  campaignId: string;
  /** Every player of the campaign (DMs excluded), with whether they are required. */
  players: RequirementsPlayer[];
  /** The minimum number of players in force, or `null` for none. */
  minPlayers: number | null;
  /** Whether custom requirements are in force, and until which day. */
  requirementsWindow: RequirementsWindow;
}

/** Feedback shown under the buttons: an i18n key plus whether it is an error. */
type Feedback = { key: string; isError: boolean } | null;

/**
 * The "Requisitos de la próxima partida" card on the edit campaign page
 * (roadmap #25). By default every player is required; here a DM picks who is
 * really needed (the rest become optional) and, optionally, a minimum number
 * of players — DMs are always required and never count towards it, so they
 * are not listed. A status line says whether custom requirements are in force
 * and until which session; once that session has passed they lapse on their
 * own, so there is nothing to remember to undo. "Restablecer" undoes them
 * earlier. Saves through `PUT /api/campaigns/[id]/requirements`, resets
 * through `DELETE`, and refreshes the server-rendered page on success.
 *
 * @param {CampaignRequirementsFormProps} props
 * @returns {JSX.Element}
 */
export default function CampaignRequirementsForm({
  campaignId,
  players,
  minPlayers,
  requirementsWindow,
}: CampaignRequirementsFormProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [requiredIds, setRequiredIds] = useState<Set<string>>(
    () =>
      new Set(players.filter((player) => player.required).map((player) => player.userId)),
  );
  const [minInput, setMinInput] = useState(minPlayers === null ? "" : String(minPlayers));
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Toggles whether one player is required. */
  function toggleRequired(userId: string) {
    const next = new Set(requiredIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setRequiredIds(next);
    setFeedback(null);
  }

  /**
   * Sends a requirements mutation and reports the outcome: on success the
   * page is refreshed so the status line reflects the stored window.
   *
   * @param {RequestInit} init - The fetch method and body.
   * @param {string} successKey - The i18n key shown on success.
   * @returns {Promise<boolean>} Whether the request succeeded.
   */
  async function send(init: RequestInit, successKey: string): Promise<boolean> {
    setIsPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/requirements`, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const fieldError = body?.fieldErrors
          ? Object.values(body.fieldErrors as Record<string, string>)[0]
          : undefined;
        setFeedback({
          key: fieldError ?? body?.error ?? "campaigns.errors.unknown",
          isError: true,
        });
        return false;
      }
      setFeedback({ key: successKey, isError: false });
      router.refresh();
      return true;
    } catch {
      setFeedback({ key: "campaigns.errors.unknown", isError: true });
      return false;
    } finally {
      setIsPending(false);
    }
  }

  /**
   * Validates the minimum and saves the requirements.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - The submit event.
   */
  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = minInput.trim();
    const min = trimmed === "" ? null : Number(trimmed);
    if (min !== null && (!Number.isInteger(min) || min < 1)) {
      setFeedback({ key: "campaigns.requirements.errors.minPlayersInvalid", isError: true });
      return;
    }

    await send(
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredUserIds: [...requiredIds], minPlayers: min }),
      },
      "campaigns.requirements.saved",
    );
  }

  /** Resets to the default rule and mirrors it in the form. */
  async function handleReset() {
    const ok = await send({ method: "DELETE" }, "campaigns.requirements.resetDone");
    if (ok) {
      setRequiredIds(new Set(players.map((player) => player.userId)));
      setMinInput("");
    }
  }

  const statusText = !requirementsWindow.active
    ? t("campaigns.requirements.statusDefault")
    : requirementsWindow.untilDate === null
      ? t("campaigns.requirements.statusOpen")
      : t("campaigns.requirements.statusUntil", {
          date: new Intl.DateTimeFormat(i18n.language, {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }).format(toUtcDate(requirementsWindow.untilDate)),
        });

  return (
    <section className="mt-8 flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4">
      <h2 className="font-display text-xl font-semibold text-ink">
        {t("campaigns.requirements.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("campaigns.requirements.hint")}</p>
      <p
        className={`rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold ${
          requirementsWindow.active ? "bg-brand-soft text-brand" : "bg-bg text-ink-muted"
        }`}
      >
        {statusText}
      </p>

      {players.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("campaigns.requirements.noPlayers")}</p>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("campaigns.requirements.required")}
            </p>
            <div className="flex flex-col">
              {players.map((player) => {
                const isRequired = requiredIds.has(player.userId);
                return (
                  <button
                    key={player.userId}
                    type="button"
                    onClick={() => toggleRequired(player.userId)}
                    aria-pressed={isRequired}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-sm text-ink transition-colors hover:bg-brand-soft"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none ${
                        isRequired
                          ? "border-brand bg-brand text-bg-elevated"
                          : "border-border"
                      }`}
                    >
                      {isRequired ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{player.name}</span>
                    {!isRequired ? (
                      <span className="shrink-0 text-xs text-ink-muted">
                        {t("date.optionalBadge")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            {t("campaigns.requirements.minPlayers")}
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={players.length}
                step={1}
                value={minInput}
                onChange={(event) => {
                  setMinInput(event.target.value);
                  setFeedback(null);
                }}
                className="min-h-[44px] w-24 rounded-[var(--radius-control)] border border-border bg-bg px-2 text-sm text-ink"
              />
              <span className="text-xs font-normal text-ink-muted">
                {t("campaigns.requirements.minPlayersHint")}
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary min-h-[44px] flex-1 text-sm font-semibold disabled:opacity-60"
            >
              {isPending ? t("common.loading") : t("campaigns.requirements.save")}
            </button>
            {requirementsWindow.active ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
              >
                {t("campaigns.requirements.reset")}
              </button>
            ) : null}
          </div>

          {feedback ? (
            <p
              className={
                feedback.isError
                  ? "rounded-[var(--radius-control)] bg-n-soft px-3 py-2 text-sm text-n"
                  : "text-sm text-s"
              }
              role={feedback.isError ? "alert" : "status"}
            >
              {t(feedback.key)}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
