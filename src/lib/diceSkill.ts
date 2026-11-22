/** Maximum length of a normalised skill name (matches `DiceEvent.skill`). */
export const DICE_SKILL_MAX_LENGTH = 60;

/**
 * Normalises a free-text skill name so equivalent spellings group together:
 * trims, collapses runs of whitespace into one space and upper-cases it
 * (Spanish locale, so "ñ" survives). Accents are kept — the database collation
 * already ignores them when grouping suggestions.
 * Example: "  lore:   hogar " -> "LORE: HOGAR".
 *
 * @param {string} raw - The skill as typed (or as found in the Excel).
 * @returns {string} The normalised skill, possibly empty.
 */
export function normalizeSkill(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
}
