"use client";

import { useTranslation } from "react-i18next";

/** The two views of the availability list. */
export type ResponderFilterValue = "pending" | "all";

interface ResponderFilterProps {
  /** The currently active view. */
  value: ResponderFilterValue;
  /** Called with the newly selected view. */
  onChange: (value: ResponderFilterValue) => void;
}

/** The available views, in display order. */
const FILTERS: ResponderFilterValue[] = ["pending", "all"];

/**
 * Segmented control switching the "Mi disponibilidad" list between the pending
 * days (no stored response yet) and all upcoming eligible days. Controlled: the
 * parent owns the value so it can also drive which cards are shown.
 *
 * @param {ResponderFilterProps} props - The active value and change handler.
 * @returns {JSX.Element} The Pendientes/Todas segmented control.
 */
export default function ResponderFilter({
  value,
  onChange,
}: ResponderFilterProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("availability.title")}
      className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-border"
    >
      {FILTERS.map((filter) => {
        const isActive = value === filter;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(filter)}
            className={`min-h-[44px] px-4 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-brand text-bg-elevated"
                : "text-ink hover:bg-brand-soft"
            }`}
          >
            {t(`availability.filter.${filter}`)}
          </button>
        );
      })}
    </div>
  );
}
