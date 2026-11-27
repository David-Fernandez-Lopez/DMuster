import type { DiceEventSkill } from "@/lib/diceEventService";

/** The catalogue categories, in the order the form lists them. */
export const SKILL_CATEGORIES = ["SKILL", "ATTRIBUTE", "CONDITION"] as const;

/** One category of the catalogue with the entries that survived the search. */
export type SkillGroup = {
  category: (typeof SKILL_CATEGORIES)[number];
  entries: DiceEventSkill[];
};

/**
 * Lower-cases a text and strips its accents, so a search for "percepcion"
 * finds "Percepción".
 *
 * @param {string} text - The text to fold.
 * @returns {string} The folded text.
 */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Groups catalogue entries by category and keeps those matching a search.
 * An entry matches when the search is contained in its name, in either
 * language (typing "stealth" finds "Sigilo" even in a Spanish interface),
 * ignoring case and accents. An empty search keeps everything. Groups left
 * empty are dropped; the catalogue order is kept inside each group.
 *
 * @param {DiceEventSkill[]} options - The campaign's catalogue entries, in catalogue order.
 * @param {string} query - What the user typed.
 * @returns {SkillGroup[]} The non-empty groups, skills first, then attributes, then conditions.
 */
export function filterSkillGroups(options: DiceEventSkill[], query: string): SkillGroup[] {
  const needle = foldText(query.trim());
  const matches = (skill: DiceEventSkill) =>
    needle === "" || foldText(skill.nameEs).includes(needle) || foldText(skill.nameEn).includes(needle);

  return SKILL_CATEGORIES.map((category) => ({
    category,
    entries: options.filter((skill) => skill.category === category && matches(skill)),
  })).filter((group) => group.entries.length > 0);
}
