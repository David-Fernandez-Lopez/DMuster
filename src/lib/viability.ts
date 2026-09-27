// Pure viability logic for DMuster: given the resolved responses of a single
// campaign's members for one eligible day, decide whether that day is viable
// (S), not viable (N) or pending (T). Free of Prisma/Next imports so it stays
// trivially unit-testable (see roadmap #17) and reusable from the calendar
// service in #18.

/**
 * A stored availability response. Mirrors the values of Prisma's
 * `AvailabilityStatus` enum, but declared locally so this module stays free of
 * Prisma imports and client components can share it (the pending "T" state is
 * never stored — it is the *absence* of a response, represented here as
 * `undefined`). `ONLINE` is "Sí (Online)": the player can play, remotely.
 */
export type ResponseStatus = "YES" | "NO" | "MAYBE" | "ONLINE";

/** The computed viability tier for a campaign on a given day. */
export type Viability = "S" | "N" | "T";

/**
 * Computes a campaign's viability for a single day from its members' resolved
 * responses. Each entry is a member's stored answer, or `undefined` when that
 * member has not responded (the derived pending state). Applies the priority in
 * CLAUDE.md §3:
 *
 * 1. any `NO` ⇒ `N` (someone cannot make it)
 * 2. else any `MAYBE` **or** missing response (`undefined`) ⇒ `T` (pending)
 * 3. else all `YES` ⇒ `S` (everyone confirmed; `ONLINE` counts as `YES`)
 *
 * An empty input yields `S` (vacuously "all confirmed"); real campaigns always
 * have members, so this edge case does not arise in practice.
 *
 * @param {Array<ResponseStatus | undefined>} statuses - The campaign members'
 *   responses for the day; `undefined` marks a member who has not answered.
 * @returns {Viability} `N`, `T` or `S` per the priority above.
 */
export function computeViability(
  statuses: Array<ResponseStatus | undefined>,
): Viability {
  if (statuses.some((status) => status === "NO")) {
    return "N";
  }
  if (statuses.some((status) => status === "MAYBE" || status === undefined)) {
    return "T";
  }
  return "S";
}

/**
 * Whether a response means the player can play that day: `YES` or `ONLINE`
 * ("Sí (Online)" is a yes, just remote). Pending (`null`/`undefined`),
 * `MAYBE` and `NO` are not. Used by the session rules (self-join, the
 * attendee warnings, the force-confirm preselection).
 *
 * @param {ResponseStatus | null | undefined} status - A member's stored
 *   response, or `null`/`undefined` when they have not answered.
 * @returns {boolean} True for `YES` and `ONLINE`.
 */
export function isAvailableResponse(
  status: ResponseStatus | null | undefined,
): boolean {
  return status === "YES" || status === "ONLINE";
}
