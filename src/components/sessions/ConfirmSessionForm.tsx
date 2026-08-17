"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Duration preloaded once a start time is set, per the locked #21 decision. */
const DEFAULT_DURATION_MINUTES = 240;

/** An existing session's editable time fields, switching the form to edit mode. */
type ExistingSession = {
  id: string;
  startTime: string | null;
  durationMinutes: number | null;
};

interface ConfirmSessionFormProps {
  /** The campaign being confirmed. Unused in edit mode (the URL already scopes it). */
  campaignId: string;
  /** The day being confirmed, "YYYY-MM-DD". */
  date: string;
  /** When present, edits this session's time instead of confirming a new one. */
  session?: ExistingSession;
}

/**
 * Inline confirm/edit form for a campaign's session on a day. Collapsed, it is
 * a single trigger button ("Confirmar partida", or "Editar hora" in edit
 * mode); tapping it reveals an optional start time and, once set, a duration
 * field preloaded with 240 minutes. Submits `POST /api/sessions` to confirm a
 * new session, or `PUT /api/sessions/[id]` to edit an existing one's time —
 * clearing the time field turns a timed session back into an all-day one,
 * since the API treats both fields as a full replace. Refreshes on success so
 * the day modal reflects the change. A blocked confirmation (e.g. a
 * conflicting campaign) renders its translated, interpolated error inline.
 *
 * @param {ConfirmSessionFormProps} props
 * @returns {JSX.Element}
 */
export default function ConfirmSessionForm({
  campaignId,
  date,
  session,
}: ConfirmSessionFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const isEditMode = session !== undefined;

  const [expanded, setExpanded] = useState(false);
  const [startTime, setStartTime] = useState(session?.startTime ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    session?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
  );
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<
    Record<string, string> | undefined
  >();

  /**
   * Submits the confirm (POST) or edit (PUT) request with the current form
   * values, then collapses and refreshes on success. An empty time clears
   * duration too (the API rejects a duration without a start time).
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
      const response = isEditMode
        ? await fetch(`/api/sessions/${session.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(timeFields),
          })
        : await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId, date, ...timeFields }),
          });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorKey(body?.error ?? "sessions.errors.unknown");
        setErrorParams(body?.params);
        return;
      }

      setExpanded(false);
      router.refresh();
    } catch {
      setErrorKey("sessions.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  if (!expanded) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`btn min-h-[44px] w-full text-sm font-semibold ${
            isEditMode ? "btn-secondary" : "btn-primary"
          }`}
        >
          {t(isEditMode ? "sessions.editTime" : "sessions.confirm")}
        </button>
        {errorKey ? (
          <p className="text-sm text-n" role="alert">
            {t(errorKey, errorParams)}
          </p>
        ) : null}
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
          className="btn btn-primary min-h-[44px] flex-1 text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? t("common.loading") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={isPending}
          className="btn btn-secondary min-h-[44px] px-3 text-sm font-semibold disabled:opacity-60"
        >
          {t("common.cancel")}
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
