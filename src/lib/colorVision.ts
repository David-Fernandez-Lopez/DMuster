/**
 * Colour-vision types a user can pick in `/profile` (mirrors the Prisma
 * `ColorVision` enum). Each one has its own palette block in globals.css,
 * stamped on <html> as `data-color-vision`; `all` is the compromise palette
 * for "I don't know" and keeps the states apart under the three.
 */
export const COLOR_VISIONS = ["protan", "deutan", "tritan", "all"] as const;

export type ColorVision = (typeof COLOR_VISIONS)[number];

/**
 * Narrows an arbitrary value (e.g. a form value) to a supported colour vision.
 *
 * @param {unknown} value - Value to check against the supported types.
 * @returns {boolean} True when the value is one of the supported types.
 */
export function isColorVision(value: unknown): value is ColorVision {
  return typeof value === "string" && COLOR_VISIONS.includes(value as ColorVision);
}
