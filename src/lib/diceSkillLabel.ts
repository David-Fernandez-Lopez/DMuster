/**
 * Picks a catalogue entry's name in the given locale: English for "en…",
 * Spanish (the app's default) for anything else.
 *
 * @param {{ nameEs: string; nameEn: string }} skill - The catalogue entry.
 * @param {string} locale - The UI language, e.g. "es" or "en".
 * @returns {string} The entry's name in that language.
 */
export function skillName(skill: { nameEs: string; nameEn: string }, locale: string): string {
  return locale.toLowerCase().startsWith("en") ? skill.nameEn : skill.nameEs;
}

/**
 * The text shown for a logged entry: the catalogue name, followed by the
 * free-text detail when there is one ("Lore: GUILD").
 *
 * @param {{ nameEs: string; nameEn: string }} skill - The catalogue entry.
 * @param {string | null} detail - The entry's optional detail.
 * @param {string} locale - The UI language, e.g. "es" or "en".
 * @returns {string} The label.
 */
export function skillLabel(
  skill: { nameEs: string; nameEn: string },
  detail: string | null,
  locale: string,
): string {
  const name = skillName(skill, locale);
  return detail ? `${name}: ${detail}` : name;
}
