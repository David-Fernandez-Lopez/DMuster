/*
 * Per-campaign colours. A campaign stores a small integer, its *slot*, never a
 * colour: the slot maps to an OKLCH colour with its own light and dark
 * variants, so the palette follows the theme and nothing free-form needs
 * validating. Slots are unique across campaigns (enforced by the services).
 *
 * Slots 0–11 come from `PALETTE`, a table chosen by an optimiser rather than by
 * eye: it maximises the smallest distance (OKLab ΔE) between any two colours
 * under normal vision and under protanopia, deuteranopia and tritanopia
 * (Machado 2009, full severity), with every colour at least 3:1 against the card
 * background (WCAG 1.4.11). Each theme has its own table, ordered so that any
 * prefix is already well separated: a new campaign takes the first free slot.
 * `campaignColor.test.ts` recomputes those guarantees, so the table cannot be
 * edited into something worse without a test failing. Slots from 12 up (13+
 * campaigns, or a slot picked by hand) fall back to a golden-angle formula that
 * never runs out but carries no colour-blindness guarantee.
 *
 * Colour never travels alone: a tag or a name is always shown next to it.
 */

/** One palette entry: the same slot's colour in each theme. */
type PaletteEntry = { light: string; dark: string };

/** The validated colours, slots 0–11. See the file header for what they guarantee. */
export const PALETTE: readonly PaletteEntry[] = [
  { light: "oklch(0.63 0.173 261.6)", dark: "oklch(0.62 0.19 292.2)" },
  { light: "oklch(0.4 0.077 64.3)", dark: "oklch(0.883 0.19 197.6)" },
  { light: "oklch(0.63 0.128 98.5)", dark: "oklch(0.86 0.177 102.1)" },
  { light: "oklch(0.464 0.153 237.4)", dark: "oklch(0.703 0.126 27.9)" },
  { light: "oklch(0.563 0.099 24.1)", dark: "oklch(0.763 0.143 274.2)" },
  { light: "oklch(0.55 0.176 309.4)", dark: "oklch(0.62 0.121 71.7)" },
  { light: "oklch(0.63 0.071 281.3)", dark: "oklch(0.809 0.17 40.2)" },
  { light: "oklch(0.476 0.115 358.2)", dark: "oklch(0.62 0.18 0.6)" },
  { light: "oklch(0.504 0.154 116.2)", dark: "oklch(0.749 0.165 112)" },
  { light: "oklch(0.4 0.171 345)", dark: "oklch(0.802 0.11 182.2)" },
  { light: "oklch(0.4 0.125 280.3)", dark: "oklch(0.9 0.095 145.6)" },
  { light: "oklch(0.556 0.172 191.8)", dark: "oklch(0.66 0.108 253.5)" },
];

/** Number of slots in `PALETTE`, the ones the colour picker offers. */
export const PALETTE_SIZE = PALETTE.length;

/** How many swatches the colour picker offers (the current slot is always added). */
export const PICKER_SLOT_COUNT = PALETTE_SIZE;

/** Largest slot a payload may carry. */
export const MAX_COLOR_SLOT = 99;

/** Golden angle in degrees: successive fallback slots land far from every earlier one. */
const GOLDEN_ANGLE = 137.508;

/** Hue of the first fallback slot, in degrees. */
const HUE_OFFSET = 25;

/** Lightness levels the fallback cycles through, for the light and the dark theme. */
const LIGHT_LEVELS = [0.5, 0.6, 0.7] as const;
const DARK_LEVELS = [0.68, 0.76, 0.84] as const;

/** Chroma the fallback uses in the light and the dark theme. */
const LIGHT_CHROMA = 0.14;
const DARK_CHROMA = 0.13;

/**
 * Hue of a fallback slot, in degrees (0 ≤ hue < 360).
 *
 * @param {number} slot - The slot, a non-negative integer.
 * @returns {number} The hue.
 */
export function campaignHue(slot: number): number {
  return (HUE_OFFSET + slot * GOLDEN_ANGLE) % 360;
}

/**
 * The CSS colour of a slot, with its light and dark variants (`light-dark()`
 * follows the page's `color-scheme`, like every token in globals.css).
 *
 * @param {number} slot - The slot, a non-negative integer.
 * @returns {string} A CSS `light-dark(oklch(...), oklch(...))` value.
 */
export function campaignColor(slot: number): string {
  const entry = PALETTE[slot];
  if (entry) {
    return `light-dark(${entry.light}, ${entry.dark})`;
  }
  const hue = campaignHue(slot).toFixed(1);
  const level = slot % LIGHT_LEVELS.length;
  return (
    `light-dark(oklch(${LIGHT_LEVELS[level]} ${LIGHT_CHROMA} ${hue}), ` +
    `oklch(${DARK_LEVELS[level]} ${DARK_CHROMA} ${hue}))`
  );
}

/**
 * A soft background tint of a slot's colour, for tag pills.
 *
 * @param {number} slot - The slot, a non-negative integer.
 * @returns {string} A CSS colour.
 */
export function campaignTint(slot: number): string {
  return `color-mix(in oklch, ${campaignColor(slot)} 22%, var(--color-bg-elevated))`;
}

/**
 * The smallest slot nobody uses yet: what a new campaign gets by default.
 *
 * @param {number[]} used - Slots already taken, in any order, repeats allowed.
 * @returns {number} The smallest non-negative integer not in `used`.
 */
export function nextFreeSlot(used: number[]): number {
  const taken = new Set(used);
  let slot = 0;
  while (taken.has(slot)) {
    slot += 1;
  }
  return slot;
}
