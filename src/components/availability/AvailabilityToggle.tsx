"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ResponseStatus as StoredResponseStatus } from "@/lib/viability";

/** The user's response for a day, or `null` when unanswered (pending "T"). */
export type ResponseStatus = StoredResponseStatus | null;

/** A selectable answer (everything except the cleared/pending `null`). */
type AnswerChoice = Exclude<ResponseStatus, null>;

/** The four answer buttons, in display order (Sí / Sí (Online) / Tal vez / No). */
const OPTIONS: ReadonlyArray<{
  value: AnswerChoice;
  labelKey: string;
  /** Vellum status-chip variant; the active fill is driven by `aria-pressed`. */
  chipClass: string;
}> = [
  { value: "YES", labelKey: "availability.yes", chipClass: "btn-yes" },
  { value: "ONLINE", labelKey: "availability.online", chipClass: "btn-online" },
  { value: "MAYBE", labelKey: "availability.maybe", chipClass: "btn-maybe" },
  { value: "NO", labelKey: "availability.no", chipClass: "btn-no" },
];

interface AvailabilityToggleProps {
  /** The day this toggle answers, "YYYY-MM-DD". */
  date: string;
  /** The user's current stored response, or `null` when pending. */
  initialStatus: ResponseStatus;
  /**
   * Notified after a change is confirmed server-side, with the new status
   * (`null` when cleared). Lets a parent keep its pending/answered view in sync
   * without a server roundtrip.
   */
  onPersisted?: (date: string, status: ResponseStatus) => void;
}

/**
 * Four large Sí/Sí (Online)/Tal vez/No buttons for setting the current user's
 * own availability on a day. Tapping a button selects that answer; tapping the
 * already-active one clears it (back to pending). The change is applied
 * optimistically, then persisted through the availability API; a failed request
 * reverts the button and shows the translated error. Shared by the "Mi
 * disponibilidad" cards and the calendar day modal — the response is global, so
 * it applies to every campaign the player belongs to.
 *
 * The buttons sit in a container-queried grid: one row of four when the toggle
 * is at least 384px wide (the day modal), a 2×2 block when narrower (the
 * desktop availability cards, three to a row), so "Sí (Online)" never wraps.
 *
 * @param {AvailabilityToggleProps} props - The day, its current status, and an
 *   optional persisted callback.
 * @returns {JSX.Element} The Sí/Sí (Online)/Tal vez/No toggle.
 */
export default function AvailabilityToggle({
  date,
  initialStatus,
  onPersisted,
}: AvailabilityToggleProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ResponseStatus>(initialStatus);
  const [isPending, setIsPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /**
   * Applies a tap on an answer button: re-tapping the active answer clears it.
   * Updates the button immediately (optimistic), then persists the change,
   * reverting to the previous value if the request fails.
   *
   * @param {AnswerChoice} choice - The tapped answer.
   */
  async function handleSelect(choice: AnswerChoice) {
    const target: ResponseStatus = choice === status ? null : choice;
    const previous = status;

    setStatus(target);
    setErrorKey(null);
    setIsPending(true);

    try {
      const response = await fetch(`/api/availability/${date}`, {
        method: target === null ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: target === null ? undefined : JSON.stringify({ status: target }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatus(previous);
        setErrorKey(body?.error ?? "availability.errors.unknown");
        return;
      }

      onPersisted?.(date, target);
    } catch {
      setStatus(previous);
      setErrorKey("availability.errors.unknown");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            disabled={isPending}
            aria-pressed={status === option.value}
            className={`btn ${option.chipClass} min-h-[44px] text-sm font-semibold disabled:opacity-60`}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
      {errorKey ? (
        <p className="mt-2 text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
