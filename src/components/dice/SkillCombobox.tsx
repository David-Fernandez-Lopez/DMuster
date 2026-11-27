"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DiceEventSkill } from "@/lib/diceEventService";
import { skillName } from "@/lib/diceSkillLabel";
import { filterSkillGroups } from "@/lib/skillSearch";

interface SkillComboboxProps {
  /** Id of the text field, so the form's `<label htmlFor>` points at it. */
  id: string;
  /** The campaign's catalogue entries, in catalogue order. */
  options: DiceEventSkill[];
  /** Id of the chosen entry, or "" when none. */
  value: string;
  /** Called with the id of the entry the user picks. */
  onChange: (skillId: string) => void;
  /** UI language, to show and match names in it. */
  locale: string;
}

/**
 * A single-choice dropdown that is also a search box, for the long closed list
 * of skills, attributes and conditions. Typing narrows the list (accents and
 * case are ignored, and both languages' names match); entries stay grouped by
 * category. Arrow keys move through the list, Enter picks, Escape closes the
 * panel without closing the modal around it. Leaving the field without picking
 * restores the name of the entry already chosen.
 *
 * @param {SkillComboboxProps} props
 * @returns {JSX.Element}
 */
export default function SkillCombobox({ id, options, value, onChange, locale }: SkillComboboxProps) {
  const { t } = useTranslation();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");

  const chosen = options.find((option) => option.id === value);
  const chosenName = chosen ? skillName(chosen, locale) : "";
  const groups = useMemo(() => filterSkillGroups(options, query), [options, query]);
  const flat = groups.flatMap((group) => group.entries);

  /** Closes the panel and drops whatever was typed without picking. */
  function close() {
    setOpen(false);
    setQuery("");
    setActiveId("");
  }

  /**
   * Picks an entry: the value changes, the panel closes.
   *
   * @param {string} skillId - Id of the picked entry.
   */
  function pick(skillId: string) {
    onChange(skillId);
    close();
  }

  // A click outside the field and its panel closes the panel.
  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Keep the active option in view while moving with the arrow keys.
  useEffect(() => {
    if (open && activeId) {
      rootRef.current?.querySelector(`[data-option-id="${activeId}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeId]);

  /**
   * Moves the active option up or down, wrapping around.
   *
   * @param {1 | -1} step - Direction to move.
   */
  function move(step: 1 | -1) {
    if (flat.length === 0) {
      return;
    }
    const index = flat.findIndex((option) => option.id === activeId);
    const next = index === -1 ? (step === 1 ? 0 : flat.length - 1) : (index + step + flat.length) % flat.length;
    setActiveId(flat[next].id);
  }

  /**
   * Keyboard handling of the field: arrows move, Enter picks, Escape closes.
   *
   * @param {React.KeyboardEvent<HTMLInputElement>} event - The key event.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && open) {
      // Never submit the form from here; pick the active entry (or the only match).
      event.preventDefault();
      const target = flat.find((option) => option.id === activeId) ?? (flat.length === 1 ? flat[0] : undefined);
      if (target) {
        pick(target.id);
      }
    } else if (event.key === "Escape" && open) {
      // The modal around listens to Escape on the document: keep it open.
      event.nativeEvent.stopPropagation();
      close();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeId ? `${listId}-${activeId}` : undefined}
        autoComplete="off"
        required
        value={open ? query : chosenName}
        placeholder={open && chosenName ? chosenName : t("diceEvents.form.skillPlaceholder")}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveId("");
        }}
        onKeyDown={handleKeyDown}
        className="min-h-[44px] w-full rounded-[var(--radius-control)] border border-border bg-bg px-3 pr-9 text-ink outline-none focus:border-brand"
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-ink-muted transition-transform ${
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

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-bg-elevated p-1 shadow-lg"
        >
          {groups.length > 0 ? (
            groups.map((group) => (
              <div key={group.category} role="group" aria-label={t(`diceEvents.category.${group.category}`)}>
                <p
                  aria-hidden="true"
                  className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[.06em] text-ink-muted"
                >
                  {t(`diceEvents.category.${group.category}`)}
                </p>
                {group.entries.map((entry) => {
                  const selected = entry.id === value;
                  return (
                    <div
                      key={entry.id}
                      id={`${listId}-${entry.id}`}
                      data-option-id={entry.id}
                      role="option"
                      aria-selected={selected}
                      // Keep the focus in the field so the click is not lost to a blur.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(entry.id)}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-ink hover:bg-brand-soft ${
                        entry.id === activeId ? "bg-brand-soft" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{skillName(entry, locale)}</span>
                      {selected ? (
                        <span aria-hidden="true" className="shrink-0 text-brand">
                          ✓
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="px-2 py-3 text-center text-sm text-ink-muted">{t("diceEvents.form.skillNoResults")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
