"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { campaignColor, PICKER_SLOT_COUNT } from "@/lib/campaignColor";

interface ColorSlotPickerProps {
  /** Form field name the chosen slot is submitted under. */
  name: string;
  /** The campaign's current slot. */
  defaultValue: number;
  /** Slots held by other campaigns, with the tag of the holder. */
  used: Record<number, string>;
}

/**
 * Swatch picker for a campaign's colour. A native radio group, so the keyboard
 * and screen readers work for free; the swatches other campaigns hold are
 * disabled and say who holds them. The current slot is always offered, even
 * beyond the usual range.
 *
 * @param {ColorSlotPickerProps} props - Field name, current slot and taken slots.
 * @returns {JSX.Element}
 */
export default function ColorSlotPicker({
  name,
  defaultValue,
  used,
}: ColorSlotPickerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const slots = Array.from(
    new Set([...Array.from({ length: PICKER_SLOT_COUNT }, (_, slot) => slot), defaultValue]),
  ).sort((a, b) => a - b);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-ink">
        {t("campaigns.form.color")}
      </legend>
      <div className="grid grid-cols-8 gap-2">
        {slots.map((slot) => {
          const holder = used[slot];
          const taken = holder !== undefined;
          const selected = value === slot;
          return (
            <label
              key={slot}
              title={taken ? t("campaigns.form.colorTaken", { tag: holder }) : undefined}
              className={`relative flex aspect-square items-center justify-center rounded-full ${
                taken ? "cursor-not-allowed opacity-30" : "cursor-pointer"
              } has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand`}
              style={{ background: campaignColor(slot) }}
            >
              <input
                type="radio"
                name={name}
                value={slot}
                checked={selected}
                disabled={taken}
                onChange={() => setValue(slot)}
                className="sr-only"
                aria-label={
                  taken
                    ? t("campaigns.form.colorTaken", { tag: holder })
                    : t("campaigns.form.colorOption", { number: slot + 1 })
                }
              />
              {selected ? (
                <span
                  aria-hidden="true"
                  className="flex h-full w-full items-center justify-center rounded-full border-[3px] border-bg-elevated text-sm font-bold text-bg-elevated"
                >
                  ✓
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">{t("campaigns.form.colorHelp")}</p>
    </fieldset>
  );
}
