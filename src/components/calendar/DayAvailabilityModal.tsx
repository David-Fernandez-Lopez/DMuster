"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import AvailabilityToggle, {
  type ResponseStatus,
} from "@/components/availability/AvailabilityToggle";
import CampaignViabilityCard from "@/components/date/CampaignViabilityCard";
import type { CampaignDayViability } from "@/lib/calendarService";
import { toUtcDate } from "@/lib/date";

interface DayAvailabilityModalProps {
  /** The selected day, "YYYY-MM-DD". */
  date: string;
  /** The user's current stored response for the day, or `null` when pending. */
  initialStatus: ResponseStatus;
  /** The user's campaigns' viability for the day (the per-campaign breakdown). */
  detail: CampaignDayViability[];
  /** Forwarded to the toggle; keeps the calendar's live map in sync. */
  onPersisted: (date: string, status: ResponseStatus) => void;
  /** Called on any close path (Escape, backdrop click, or close button). */
  onClose: () => void;
}

/**
 * Modal for responding to a single calendar day, opened when a day is tapped on
 * the grid. Deliberately **not** a native `showModal()` dialog: that promotes the
 * element to the browser top layer, which paints above everything including the
 * sticky navbar. Instead it is a `fixed` overlay at `z-[5]`, below the navbar's
 * `z-10`, so the navbar stays visible and usable on top while the rest is dimmed.
 *
 * Because it is not top-layer, the affordances `<dialog>` gave for free are
 * reimplemented: Escape and a click on the backdrop call `onClose`; focus moves
 * to the box on mount and is restored to the previously focused element on
 * unmount. `aria-modal="false"` reflects that the navbar is intentionally still
 * reachable (no focus trap). Responding does not auto-close, so the player can
 * adjust their answer.
 *
 * @param {DayAvailabilityModalProps} props - The day, current status, the
 *   per-campaign breakdown, and the persisted/close callbacks.
 * @returns {JSX.Element} The day availability modal.
 */
export default function DayAvailabilityModal({
  date,
  initialStatus,
  detail,
  onPersisted,
  onClose,
}: DayAvailabilityModalProps) {
  const { t, i18n } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Close on Escape, move focus into the box on open, and restore it on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const longDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(date));

  return (
    <div
      className="fixed inset-0 z-[5] overflow-y-auto bg-black/40"
      onClick={(event) => {
        // Only a click on the padded flex wrapper (the backdrop area) closes;
        // clicks inside the box bubble up with a different target.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex min-h-full items-start justify-center p-4 pt-20"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          ref={boxRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="w-[min(92vw,420px)] rounded-[var(--radius-card)] border border-border bg-bg-elevated text-ink outline-none [font-variant:small-caps]"
        >
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2
                id={titleId}
                className="font-display text-lg font-semibold text-ink first-letter:uppercase"
              >
                {longDate}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-ink-muted transition-colors hover:bg-brand-soft"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-4">
              <AvailabilityToggle
                date={date}
                initialStatus={initialStatus}
                onPersisted={onPersisted}
              />
            </div>

            {detail.length > 0 ? (
              <div className="mt-5 grid grid-cols-1 items-start gap-3">
                {detail.map((campaign) => (
                  <CampaignViabilityCard
                    key={campaign.campaignId}
                    campaign={campaign}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
