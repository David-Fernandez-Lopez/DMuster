// Pure viability logic for DMuster: given the resolved responses of a single
// campaign's members for one eligible day, decide whether that day is viable
// (S), viable with someone playing online (O), not viable (N), pending (T) or
// taken by another campaign's session (B). Free of Prisma/Next imports so it
// stays trivially unit-testable (see roadmap #17) and reusable from the
// calendar service in #18.

/**
 * A stored availability response. Mirrors the values of Prisma's
 * `AvailabilityStatus` enum, but declared locally so this module stays free of
 * Prisma imports and client components can share it (the pending "T" state is
 * never stored — it is the *absence* of a response, represented here as
 * `undefined`). `ONLINE` is "Sí (Online)": the player can play, remotely.
 */
export type ResponseStatus = "YES" | "NO" | "MAYBE" | "ONLINE";

/**
 * The computed viability tier for a campaign on a given day. `O` is a viable
 * day like `S`, flagged because at least one member plays online. `B`
 * ("Ocupado") means at least one member already attends another campaign's
 * active session that day.
 */
export type Viability = "S" | "O" | "N" | "T" | "B";

/**
 * A member's resolved state for one day, as fed to `computeViability`: their
 * stored answer, `"BUSY"` when they already attend another campaign's active
 * session that day (which overrides any answer), or `undefined` when they have
 * not responded (the derived pending state).
 */
export type MemberAvailability = ResponseStatus | "BUSY" | undefined;

/**
 * Computes a campaign's viability for a single day from its members' resolved
 * states. Each entry is a member's stored answer, `"BUSY"` when they already
 * play another campaign's session that day, or `undefined` when they have not
 * responded (the derived pending state). Applies the priority in CLAUDE.md §3:
 *
 * 1. any `BUSY` ⇒ `B` (someone already plays another session that day)
 * 2. else any `NO` ⇒ `N` (someone cannot make it)
 * 3. else any `MAYBE` **or** missing response (`undefined`) ⇒ `T` (pending)
 * 4. else any `ONLINE` ⇒ `O` (everyone can play, someone remotely)
 * 5. else all `YES` ⇒ `S` (everyone confirmed in person)
 *
 * An empty input yields `S` (vacuously "all confirmed"); real campaigns always
 * have members, so this edge case does not arise in practice.
 *
 * @param {ReadonlyArray<MemberAvailability>} statuses - The campaign members'
 *   resolved states for the day.
 * @returns {Viability} `B`, `N`, `T`, `O` or `S` per the priority above.
 */
export function computeViability(
  statuses: ReadonlyArray<MemberAvailability>,
): Viability {
  if (statuses.some((status) => status === "BUSY")) {
    return "B";
  }
  if (statuses.some((status) => status === "NO")) {
    return "N";
  }
  if (statuses.some((status) => status === "MAYBE" || status === undefined)) {
    return "T";
  }
  if (statuses.some((status) => status === "ONLINE")) {
    return "O";
  }
  return "S";
}

/**
 * One member's input to `computeCampaignViability`: their resolved state for
 * the day, whether they are a DM of the campaign, and whether the campaign's
 * requirements in force that day mark them optional (always `false` when the
 * default "everyone is required" rule applies).
 */
export type ViabilityMember = {
  availability: MemberAvailability;
  isDm: boolean;
  optional: boolean;
};

/** The non-viable tiers, ranked by how strongly they block: B > N > T. */
const BLOCKING_RANK: Record<"B" | "N" | "T", number> = { B: 3, N: 2, T: 1 };

/**
 * Whether a member must be able to play for the campaign to be viable: every
 * DM (DMs can never be optional), plus every player the requirements do not
 * mark optional.
 *
 * @param {Pick<ViabilityMember, "isDm" | "optional">} member - The member.
 * @returns {boolean} True when the member is required.
 */
export function isRequiredMember(
  member: Pick<ViabilityMember, "isDm" | "optional">,
): boolean {
  return member.isDm || !member.optional;
}

/**
 * Checks a campaign's minimum-players requirement for one day, counting only
 * players (DMs never count towards the minimum) and returning how far it is
 * from being met:
 *
 * - enough players can play (`YES`/`ONLINE`) ⇒ `null` (met)
 * - else enough if the `MAYBE`/pending ones said yes ⇒ `T`
 * - else enough if the busy ones were free ⇒ `B`
 * - else not even then (too many `NO`) ⇒ `N`
 *
 * @param {ReadonlyArray<ViabilityMember>} members - Every campaign member.
 * @param {number} minPlayers - The minimum number of players required.
 * @returns {"T" | "B" | "N" | null} The tier the shortfall maps to, or `null`.
 */
function quorumShortfall(
  members: ReadonlyArray<ViabilityMember>,
  minPlayers: number,
): "T" | "B" | "N" | null {
  let available = 0;
  let pending = 0;
  let busy = 0;
  for (const member of members) {
    if (member.isDm) {
      continue;
    }
    if (member.availability === "YES" || member.availability === "ONLINE") {
      available += 1;
    } else if (member.availability === "MAYBE" || member.availability === undefined) {
      pending += 1;
    } else if (member.availability === "BUSY") {
      busy += 1;
    }
  }

  if (available >= minPlayers) {
    return null;
  }
  if (available + pending >= minPlayers) {
    return "T";
  }
  if (available + pending + busy >= minPlayers) {
    return "B";
  }
  return "N";
}

/**
 * Computes a campaign's viability for a single day under its requirements
 * (roadmap #25): the required members (every DM plus the players not marked
 * optional) go through the regular priority of `computeViability`, and, when a
 * minimum is set, enough players must be able to play (`quorumShortfall`).
 * Optional members never block on their own; they only count towards the
 * minimum. The result is the stronger block of the two (B > N > T); when both
 * pass, it is `O` if any member who will play is online, else `S`.
 *
 * With no member optional and no minimum this is exactly
 * `computeViability` over every member — the default rule.
 *
 * A campaign whose players are all optional with no minimum set (the last
 * required player left a campaign of always-optional ones, roadmap #25.2)
 * still needs one player who can play: the DM alone never makes a session.
 *
 * @param {ReadonlyArray<ViabilityMember>} members - Every campaign member.
 * @param {number | null} minPlayers - The minimum number of players, or `null`
 *   when the requirements set none.
 * @returns {Viability} `B`, `N`, `T`, `O` or `S`.
 */
export function computeCampaignViability(
  members: ReadonlyArray<ViabilityMember>,
  minPlayers: number | null,
): Viability {
  const base = computeViability(
    members.filter(isRequiredMember).map((member) => member.availability),
  );
  const players = members.filter((member) => !member.isDm);
  const effectiveMin =
    minPlayers ??
    (players.length > 0 && !players.some(isRequiredMember) ? 1 : null);
  const shortfall =
    effectiveMin === null ? null : quorumShortfall(members, effectiveMin);

  const blocking = [base, shortfall].filter(
    (tier): tier is "B" | "N" | "T" => tier === "B" || tier === "N" || tier === "T",
  );
  if (blocking.length > 0) {
    return blocking.reduce((worst, tier) =>
      BLOCKING_RANK[tier] > BLOCKING_RANK[worst] ? tier : worst,
    );
  }

  // Every required member can play, so every `ONLINE` member — required or an
  // available optional one — is someone who will play remotely.
  return members.some((member) => member.availability === "ONLINE") ? "O" : "S";
}

/**
 * Resolves one member's state for `computeViability`: being busy in another
 * campaign's session that day overrides whatever they answered, and a missing
 * answer (`null`/`undefined`) becomes the pending `undefined`.
 *
 * @param {ResponseStatus | null | undefined} status - The member's stored
 *   response, or `null`/`undefined` when they have not answered.
 * @param {boolean} isBusy - Whether the member attends another campaign's
 *   active session that day.
 * @returns {MemberAvailability} `"BUSY"`, the stored answer, or `undefined`.
 */
export function resolveMemberAvailability(
  status: ResponseStatus | null | undefined,
  isBusy: boolean,
): MemberAvailability {
  if (isBusy) {
    return "BUSY";
  }
  return status ?? undefined;
}

/**
 * Whether a viability tier means the campaign can play that day: `S`, or `O`
 * (everyone can play, someone online). This is what lets a DM confirm a
 * session without forcing it. `T`, `N` and `B` are not viable.
 *
 * @param {Viability} viability - The computed tier.
 * @returns {boolean} True for `S` and `O`.
 */
export function isViable(viability: Viability): boolean {
  return viability === "S" || viability === "O";
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
