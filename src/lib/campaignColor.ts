/*
 * Per-campaign colours. A campaign stores a small integer, its *slot*, never a
 * colour: the slot maps to an OKLCH colour with its own light and dark
 * variants, so the palette follows the theme and nothing free-form needs
 * validating. Slots are unique across campaigns (enforced by the services).
 *
 * Hues are spread with the golden angle, which keeps the first N slots as far
 * apart as possible whatever N is and never runs out; lightness cycles through
 * three levels so that neighbouring hues are told apart by more than hue alone.
 * Colour never travels alone: a tag or a name is always shown next to it.
 */

/** Golden angle in degrees: successive slots land far from every earlier one. */
const GOLDEN_ANGLE = 137.508;

/** Hue of slot 0, in degrees. */
const HUE_OFFSET = 25;

/** Lightness levels cycled by slot, for the light and the dark theme. */
const LIGHT_LEVELS = [0.5, 0.6, 0.7] as const;
const DARK_LEVELS = [0.68, 0.76, 0.84] as const;

/** Chroma used in the light and the dark theme. */
const LIGHT_CHROMA = 0.14;
const DARK_CHROMA = 0.13;

/** How many swatches the colour picker offers (the current one is always added). */
export const PICKER_SLOT_COUNT = 24;

/** Largest slot a payload may carry. */
export const MAX_COLOR_SLOT = 99;

/**
 * Hue of a slot, in degrees (0 ≤ hue < 360).
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
