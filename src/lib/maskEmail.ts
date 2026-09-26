/**
 * Hides most of an email address while leaving enough for its owner to
 * recognise it: `beatriz@ejemplo.com` becomes `b*****z@ejemplo.com`.
 *
 * For the invitation page, which anyone holding the link can read without a
 * session and without consuming the token. The recipient needs to see that the
 * invitation is for them; nobody else needs the address itself.
 *
 * The domain is kept whole — it is rarely the identifying part, and hiding it
 * would leave the recipient unable to tell which of their addresses this is.
 * A local part of one or two characters is replaced entirely rather than
 * revealed by the "keep first and last" rule.
 *
 * @param {string} email - The address to mask.
 * @returns {string} The masked address, or the input unchanged if it has no `@`.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    return email;
  }

  const local = email.slice(0, at);
  const domain = email.slice(at);

  if (local.length <= 2) {
    return `${"*".repeat(local.length)}${domain}`;
  }

  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}${domain}`;
}
