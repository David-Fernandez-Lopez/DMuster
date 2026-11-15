import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import type { AppLocale } from "@/i18n/settings";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/passwordReset";

/**
 * Escapes the characters that are significant in HTML text and attributes.
 *
 * @param {string} value - Raw text.
 * @returns {string} The text, safe to place in an element or a quoted attribute.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Replaces `{{key}}` placeholders, the same syntax the locale files use.
 *
 * @param {string} template - Text from the locale file.
 * @param {Record<string, string>} values - Placeholder values.
 * @returns {string} The filled-in text.
 */
function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

/**
 * Builds the password-reset email in the recipient's language, from the same
 * locale files the UI uses. Everything placed in the HTML part, the link
 * included, is escaped.
 *
 * @param {{ locale: AppLocale; name: string; link: string }} input - Language, recipient's name and reset URL.
 * @returns {{ subject: string; text: string; html: string }} The message content.
 */
export function buildPasswordResetEmail(input: {
  locale: AppLocale;
  name: string;
  link: string;
}): { subject: string; text: string; html: string } {
  const copy = (input.locale === "en" ? en : es).passwordReset.email;
  const values = { name: input.name, minutes: String(PASSWORD_RESET_TTL_MINUTES) };
  const greeting = interpolate(copy.greeting, values);
  const expiry = interpolate(copy.expiry, values);

  const text = [greeting, "", copy.intro, input.link, "", expiry, copy.ignore].join("\n");

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(copy.intro)}</p>`,
    `<p><a href="${escapeHtml(input.link)}">${escapeHtml(copy.button)}</a></p>`,
    `<p>${escapeHtml(expiry)}</p>`,
    `<p>${escapeHtml(copy.ignore)}</p>`,
  ].join("\n");

  return { subject: copy.subject, text, html };
}
