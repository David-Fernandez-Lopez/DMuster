/**
 * Names Auth.js uses for the session cookie. The `__Secure-` prefixed one is
 * what it writes when the deployment is served over HTTPS.
 *
 * Kept here, in one place, because more than one part of the app has to know
 * them: the route proxy decides whether to let a request through by their
 * presence, and ending every session has to clear them. A rename that reached
 * only one of those would leave the other silently wrong.
 */
export const SESSION_COOKIE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

/** The minimum of a Next.js cookie store this module needs to clear cookies. */
type DeletableCookieStore = { delete: (name: string) => unknown };

/**
 * Removes both session cookies, so a browser stops presenting a token whose
 * row no longer exists.
 *
 * Both names are cleared regardless of which one is present: whichever is not
 * there is a no-op, and hard-coding "the one this deployment uses" would break
 * the day it moves behind TLS.
 *
 * @param {DeletableCookieStore} store - The cookie store from `cookies()`.
 */
export function clearSessionCookies(store: DeletableCookieStore): void {
  store.delete(SESSION_COOKIE);
  store.delete(SECURE_SESSION_COOKIE);
}
