"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The user's response for a day, or `null` when unanswered (pending "T"). */
export type ResponseStatus = "YES" | "NO" | "MAYBE" | null;

/** A selectable answer (everything except the cleared/pending `null`). */
type AnswerChoice = Exclude<ResponseStatus, null>;

/** The three answer buttons, in display order (Sí / Tal vez / No). */
const OPTIONS: ReadonlyArray<{
  value: AnswerChoice;
  labelKey: string;
  activeClass: string;
  idleHoverClass: string;
}> = [
  {
    value: "YES",
    labelKey: "availability.yes",
    activeClass: "border-s bg-s text-white",
    idleHoverClass: "hover:bg-s-soft",
  },
  {
    value: "MAYBE",
    labelKey: "availability.maybe",
    activeClass: "border-t bg-t text-white",
    idleHoverClass: "hover:bg-t-soft",
  },
  {
    value: "NO",
    labelKey: "availability.no",
    activeClass: "border-n bg-n text-white",
    idleHoverClass: "hover:bg-n-soft",
  },
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
 * Three large Sí/Tal vez/No buttons for setting the current user's own
 * availability on a day. Tapping a button selects that answer; tapping the
 * already-active one clears it (back to pending). The change is applied
 * optimistically, then persisted through the availability API; a failed request
 * reverts the button and shows the translated error. Shared by the "Mi
 * disponibilidad" cards and the calendar day modal — the response is global, so
 * it applies to every campaign the player belongs to.
 *
 * @param {AvailabilityToggleProps} props - The day, its current status, and an
 *   optional persisted callback.
 * @returns {JSX.Element} The Sí/Tal vez/No toggle.
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
    <div>
      <div className="flex gap-2">
        {OPTIONS.map((option) => {
          const isActive = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              disabled={isPending}
              aria-pressed={isActive}
              className={`min-h-[44px] flex-1 rounded-[var(--radius-control)] border text-sm font-semibold transition-colors disabled:opacity-60 ${
                isActive
                  ? option.activeClass
                  : `border-border bg-bg text-ink ${option.idleHoverClass}`
              }`}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>
      {errorKey ? (
        <p className="mt-2 text-sm text-n" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
