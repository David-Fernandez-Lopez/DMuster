"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** One selectable option of a `MultiSelectFilter`. */
export type MultiSelectOption = {
  /** Stable identity used for selection (e.g. campaignId / userId). */
  id: string;
  /** Short label shown as a chip in the control (tag or name). */
  chip: string;
  /** Full label shown in the dropdown list and matched by the search box. */
  label: string;
};

interface MultiSelectFilterProps {
  /** Section heading, shown above the control and used as its accessible name. */
  title: string;
  /** All selectable options, in display order. */
  options: MultiSelectOption[];
  /** Ids currently selected (shown on the calendar). */
  selectedIds: Set<string>;
  /** Receives the full next selection on any change (toggle, remove, select-all). */
  onChange: (next: Set<string>) => void;
}

/**
 * A dropdown multi-select, reused for the Campaigns and Masters filters. Mirrors
 * the `react-multi-select-component` UX with the project's own tokens: a control
 * showing the selection as removable chips (the short `chip` label) plus a
 * caret, opening a floating panel with a search box, a "select all / none"
 * toggle and a checkbox row per option (the full `label`). Selecting keeps the
 * panel open; a click outside or Escape closes it. Renders nothing when there is
 * at most one option — a single choice needs no filter.
 *
 * @param {MultiSelectFilterProps} props
 * @returns {JSX.Element | null}
 */
export default function MultiSelectFilter({
  title,
  options,
  selectedIds,
  onChange,
}: MultiSelectFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const closePanel = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Close on Escape or an outside click; only while open (mirrors MobileNav).
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePanel();
      }
    }
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closePanel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, closePanel]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  if (options.length <= 1) {
    return null;
  }

  const selectedOptions = options.filter((option) => selectedIds.has(option.id));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) =>
        option.label.toLowerCase().includes(normalizedQuery),
      )
    : options;
  const allSelected =
    options.length > 0 && options.every((option) => selectedIds.has(option.id));
  const someSelected = options.some((option) => selectedIds.has(option.id));

  /**
   * Toggles one option id, emitting the full next selection.
   *
   * @param {string} id - The option to toggle.
   */
  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(options.map((o) => o.id)));
  }

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1 block font-display text-sm font-semibold text-ink">
        {title}
      </span>

      <div
        role="combobox"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        aria-label={title}
        tabIndex={0}
        onClick={() => (open ? closePanel() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) {
              closePanel();
            } else {
              setOpen(true);
            }
          }
        }}
        className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-bg px-2 text-sm outline-none transition-colors focus-visible:border-brand"
      >
        <span className="flex flex-1 flex-wrap gap-1 py-1">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((option) => (
              <span
                key={option.id}
                className="flex items-center gap-1 rounded-[var(--radius-control)] bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand"
              >
                {option.chip}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(option.id);
                  }}
                  aria-label={`${t("calendar.filter.remove")} ${option.label}`}
                  className="leading-none transition-opacity hover:opacity-70"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {open ? (
        <div
          id={panelId}
          className="absolute left-0 right-0 z-10 mt-1 rounded-[var(--radius-card)] border border-border bg-bg-elevated p-2 shadow-lg"
        >
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("calendar.filter.search")}
            aria-label={t("calendar.filter.search")}
            className="w-full min-h-[40px] rounded-[var(--radius-control)] border border-border bg-bg px-3 text-sm text-ink outline-none focus-visible:border-brand"
          />

          <button
            type="button"
            onClick={toggleAll}
            aria-pressed={allSelected}
            className="mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-brand-soft"
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none ${
                allSelected
                  ? "border-brand bg-brand text-bg-elevated"
                  : "border-border"
              }`}
            >
              {allSelected ? "✓" : someSelected ? "–" : ""}
            </span>
            {allSelected
              ? t("calendar.filter.selectNone")
              : t("calendar.filter.selectAll")}
          </button>

          <div className="mt-1 max-h-60 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((option) => {
                const isSelected = selectedIds.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(option.id)}
                    aria-pressed={isSelected}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-brand-soft"
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
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {option.chip !== option.label ? (
                      <span className="shrink-0 font-display text-xs font-semibold text-ink-muted">
                        {option.chip}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-3 text-center text-sm text-ink-muted">
                {t("calendar.filter.noResults")}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
