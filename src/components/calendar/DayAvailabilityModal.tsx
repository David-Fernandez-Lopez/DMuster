"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import AvailabilityToggle, {
  type ResponseStatus,
} from "@/components/availability/AvailabilityToggle";
import { toUtcDate } from "@/lib/date";

interface DayAvailabilityModalProps {
  /** The selected day, "YYYY-MM-DD". */
  date: string;
  /** Tags of the user's campaigns (the "Afecta a" line). */
  tags: string[];
  /** The user's current stored response for the day, or `null` when pending. */
  initialStatus: ResponseStatus;
  /** Forwarded to the toggle; keeps the calendar's live map in sync. */
  onPersisted: (date: string, status: ResponseStatus) => void;
  /** Called when the dialog closes (Escape, backdrop click, or close button). */
  onClose: () => void;
}

/**
 * Modal for responding to a single calendar day, opened when a day is tapped on
 * the grid. Built on the native `<dialog>` element via `showModal()`, which
 * gives the focus trap, Escape handling, top-layer stacking and focus restore
 * for free — no portal or focus-trap library needed. The component is only
 * mounted while a day is selected, so it opens on mount and every exit path
 * (Escape, backdrop click, the close button) funnels through the dialog's
 * native `close` event into `onClose`, which unmounts it. Responding does not
 * auto-close, so the player can adjust their answer.
 *
 * @param {DayAvailabilityModalProps} props - The day, affected tags, current
 *   status, and the persisted/close callbacks.
 * @returns {JSX.Element} The day availability modal.
 */
export default function DayAvailabilityModal({
  date,
  tags,
  initialStatus,
  onPersisted,
  onClose,
}: DayAvailabilityModalProps) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open as a true modal on mount (top layer + focus trap + Escape come free).
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const longDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(date));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click whose target is the dialog itself lands on the backdrop (the
        // padded inner div covers the box), so it closes; content clicks don't.
        if (event.target === dialogRef.current) {
          dialogRef.current.close();
        }
      }}
      className="m-auto w-[min(92vw,420px)] rounded-[var(--radius-card)] border border-border bg-bg-elevated p-0 text-ink backdrop:bg-black/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2
            id={titleId}
            className="font-display text-xl font-semibold text-ink first-letter:uppercase"
          >
            {longDate}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("common.close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-ink-muted transition-colors hover:bg-brand-soft"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
        </div>

        {tags.length > 0 ? (
          <p className="mt-1 text-sm text-ink-muted">
            {t("availability.affects", { tags: tags.join(", ") })}
          </p>
        ) : null}

        <div className="mt-4">
          <AvailabilityToggle
            date={date}
            initialStatus={initialStatus}
            onPersisted={onPersisted}
          />
        </div>
      </div>
    </dialog>
  );
}
