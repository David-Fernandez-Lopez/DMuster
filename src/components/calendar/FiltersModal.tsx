"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

interface FiltersModalProps {
  /** Modal title, shown as the dialog heading. */
  title: string;
  /** The campaign filter chip group, rendered as the modal body. */
  children: React.ReactNode;
  /** Called on any close path (Escape, backdrop click, or close button). */
  onClose: () => void;
}

/**
 * Modal wrapping the campaign filter chips, opened from the "Filtros" trigger
 * above the month selector. Mirrors `DayAvailabilityModal`'s overlay pattern:
 * deliberately **not** a native `showModal()` dialog, so it stays a `fixed`
 * overlay at `z-[5]`, below the sticky navbar's `z-10`, keeping the navbar
 * usable while the rest is dimmed. Escape and a backdrop click call `onClose`;
 * focus moves to the box on mount and is restored to the previously focused
 * element on unmount.
 *
 * @param {FiltersModalProps} props - The title, chip group body, and close callback.
 * @returns {JSX.Element} The filters modal.
 */
export default function FiltersModal({
  title,
  children,
  onClose,
}: FiltersModalProps) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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

  return (
    <div
      className="fixed inset-0 z-[5] overflow-y-auto bg-black/40"
      onClick={(event) => {
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
          className="w-[min(92vw,420px)] rounded-[var(--radius-card)] border border-border bg-bg-elevated text-ink outline-none"
        >
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2
                id={titleId}
                className="font-display text-lg font-semibold text-ink"
              >
                {title}
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

            <div className="mt-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
