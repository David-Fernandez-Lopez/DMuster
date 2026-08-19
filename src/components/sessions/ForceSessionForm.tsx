"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { PlayerDayStatus } from "@/lib/calendarService";

/** Duration preloaded once a start time is set, per the locked #21/#22 decision. */
const DEFAULT_DURATION_MINUTES = 240;

/** The override form's local state machine. */
type Step = "closed" | "warning" | "time";

interface ForceSessionFormProps {
  /** The campaign being force-confirmed. */
  campaignId: string;
  /** The day being confirmed, "YYYY-MM-DD". */
  date: string;
  /** Every member of the campaign with their response for this day. */
  players: PlayerDayStatus[];
  /** The confirming DM's id — always selected and locked in the checklist. */
  currentUserId: string;
}

/**
 * The master-override flow (roadmap #22): confirming a session on a non-`S`
 * day. Collapsed, a single warning-styled "Forzar partida" trigger (visually
 * distinct from `ConfirmSessionForm`'s primary confirm button) sits under the
 * existing "not viable" note. Tapping it opens a two-step panel: a warning
 * naming who said No and who hasn't answered, plus a checklist of every
 * member (prechecked Sí/Tal vez, the confirming DM's own row locked); then
 * the same optional start time + duration fields as `ConfirmSessionForm`.
 * Submits `POST /api/sessions` with the chosen `attendeeIds` and refreshes on
 * success. A blocked confirmation (e.g. a conflicting campaign) renders its
 * translated, interpolated error inline.
 *
 * @param {ForceSessionFormProps} props
 * @returns {JSX.Element}
 */
export default function ForceSessionForm({
  campaignId,
  date,
  players,
  currentUserId,
}: ForceSessionFormProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<Step>("closed");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<
    Record<string, string> | undefined
  >();

  /** Opens the warning step, preselecting Sí/Tal vez plus the confirming DM. */
  function openWarning() {
    const preselected = new Set(
      players
        .filter((player) => player.status === "YES" || player.status === "MAYBE")
        .map((player) => player.userId),
    );
    preselected.add(currentUserId);
    setSelected(preselected);
    setErrorKey(null);
    setErrorParams(undefined);
    setStep("warning");
  }

  /** Toggles one member's selection; the confirming DM's own row is locked. */
  function toggleAttendee(userId: string) {
    if (userId === currentUserId) {
      return;
    }
    const next = new Set(selected);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelected(next);
  }

  /**
   * Submits the override confirmation with the current attendee selection
   * and time fields, then collapses and refreshes on success.
   */
  async function handleSubmit() {
    setIsPending(true);
    setErrorKey(null);
    setErrorParams(undefined);

    const timeFields =
      startTime === ""
        ? { startTime: null, durationMinutes: null }
        : { startTime, durationMinutes };

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          date,
          ...timeFields,
          attendeeIds: [...selected],
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "sessions.errors.unknown");
        setErrorParams(body?.params);
        return;
      }

      setStep("closed");
      router.refresh();
    } catch {
      setErrorKey("sessions.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  if (step === "closed") {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={openWarning}
          className="btn btn-maybe min-h-[44px] w-full text-sm font-semibold"
        >
          {t("sessions.force")}
        </button>
        <p className="text-xs text-ink-muted">{t("sessions.notViable")}</p>
      </div>
    );
  }

  if (step === "warning") {
    const noPlayers = players.filter((player) => player.status === "NO");
    const pendingPlayers = players.filter((player) => player.status === null);

    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-bg p-3">
        {noPlayers.length > 0 ? (
          <p className="text-sm text-n">
            {t("sessions.forceWarning", {
              players: noPlayers.map((player) => player.name).join(", "),
            })}
          </p>
        ) : null}
        {pendingPlayers.length > 0 ? (
          <p className="text-sm text-t">
            {t("sessions.forceWarningPending", {
              players: pendingPlayers.map((player) => player.name).join(", "),
            })}
          </p>
        ) : null}

        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("sessions.selectAttendees")}
        </p>
        <div className="flex flex-col">
          {players.map((player) => {
            const isSelected = selected.has(player.userId);
            const isLocked = player.userId === currentUserId;
            return (
              <button
                key={player.userId}
                type="button"
                onClick={() => toggleAttendee(player.userId)}
                disabled={isLocked}
                aria-pressed={isSelected}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-sm text-ink transition-colors hover:bg-brand-soft disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none ${
                    isSelected
                      ? "border-brand bg-brand text-bg-elevated"
                      : "border-border"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 truncate">{player.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("time")}
            className="btn btn-primary min-h-[44px] flex-1 text-sm font-semibold"
          >
            {t("common.continue")}
          </button>
          <button
            type="button"
            onClick={() => setStep("closed")}
            className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-bg p-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        {t("sessions.startTime")}
        <input
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-bg-elevated px-2 text-sm text-ink"
        />
      </label>

      {startTime !== "" ? (
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
          {t("sessions.duration")}
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1440}
              step={30}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="min-h-[44px] w-24 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-2 text-sm text-ink"
            />
            <span className="text-sm font-normal text-ink-muted">
              {t("sessions.durationUnit")}
            </span>
          </span>
        </label>
      ) : null}

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="btn btn-maybe min-h-[44px] flex-1 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("sessions.force")}
        </button>
        <button
          type="button"
          onClick={() => setStep("warning")}
          disabled={isPending}
          className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("common.back")}
        </button>
      </div>

      {errorKey ? (
        <p className="text-sm text-n" role="alert">
          {t(errorKey, errorParams)}
        </p>
      ) : null}
    </div>
  );
}
