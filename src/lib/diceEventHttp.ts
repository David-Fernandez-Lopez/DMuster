/**
 * Maps a dice event / arc service error key to an HTTP status: missing records
 * are 404, a reference that does not check out (player not in the campaign,
 * future date, foreign arc or session) is the caller's fault (400), anything
 * else is a 500.
 *
 * @param {string} error - i18n error key returned by a service.
 * @returns {number} The HTTP status to answer with.
 */
export function statusForDiceError(error: string): number {
  if (error.endsWith(".notFound")) {
    return 404;
  }
  if (error.endsWith(".unknown")) {
    return 500;
  }
  return 400;
}
