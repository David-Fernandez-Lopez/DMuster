import { Prisma } from "@/generated/prisma/client";
import { CampaignRole } from "@/generated/prisma/enums";
import { getCampaignRole } from "@/lib/authz";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationStatus,
  type InvitationStatus,
} from "@/lib/invitation";
import { prisma } from "@/lib/prisma";
import { registerUser } from "@/lib/userService";

/** Prisma error code raised on a unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/** One calendar day, in milliseconds — for the `daysLeft` countdown. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** An invitation as seen by its inviter: never exposes `tokenHash`. */
export type InvitationDto = {
  id: string;
  email: string;
  campaign: { id: string; name: string; tag: string } | null;
  role: CampaignRole | null;
  status: InvitationStatus;
  /** ISO instant the invitation stops being acceptable. */
  expiresAt: string;
  /** Whole days left before `expiresAt`, floored at 0 (meaningful for `"pending"`). */
  daysLeft: number;
  createdAt: string;
};

/** The invitation fields needed to derive its DTO, as selected from Prisma. */
type InvitationRow = {
  id: string;
  email: string;
  role: CampaignRole | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  campaign: { id: string; name: string; tag: string } | null;
};

/**
 * Flattens an `Invitation` row into its DTO, deriving `status` and `daysLeft`
 * from a single shared `now` so a batch of rows (`listInvitations`) is
 * evaluated against one consistent instant.
 *
 * @param {InvitationRow} row - The raw invitation row.
 * @param {Date} now - The current time.
 * @returns {InvitationDto} The flattened, client-safe invitation.
 */
function toInvitationDto(row: InvitationRow, now: Date): InvitationDto {
  return {
    id: row.id,
    email: row.email,
    campaign: row.campaign,
    role: row.role,
    status: invitationStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((row.expiresAt.getTime() - now.getTime()) / DAY_MS)),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Fields selected for `InvitationRow` on every read below. */
const INVITATION_ROW_SELECT = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  campaign: { select: { id: true, name: true, tag: true } },
} as const;

/** Result of creating an invitation. `error` holds an i18n key on failure. */
export type CreateInvitationResult =
  | { ok: true; invitation: InvitationDto; token: string }
  | { ok: false; error: string };

/**
 * Creates a single-use invitation for an email address, optionally scoped to
 * a campaign + role so accepting also joins that campaign. Rejects an email
 * that already has an account, or already has a pending invitation; when a
 * campaign is given, the inviter must be a DM of *that* campaign (checked via
 * `getCampaignRole`, which also hides a non-existent campaign behind the same
 * `forbidden` key). The raw token is returned **only here** — the caller must
 * hand it to the inviter immediately, since only its hash is ever stored.
 *
 * @param {{ email: string; campaignId?: string; role?: CampaignRole; invitedById: string }} input -
 *   The recipient's email, optional campaign scope, and the inviting user.
 * @returns {Promise<CreateInvitationResult>} Success with the DTO and raw
 *   token, or an error key (`invitations.errors.emailTaken` /
 *   `alreadyInvited` / `forbidden` / `unknown`).
 */
export async function createInvitation(input: {
  email: string;
  campaignId?: string;
  role?: CampaignRole;
  invitedById: string;
}): Promise<CreateInvitationResult> {
  const email = input.email.trim().toLowerCase();
  const now = new Date();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    return { ok: false, error: "invitations.errors.emailTaken" };
  }

  const pendingInvitation = await prisma.invitation.findFirst({
    where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (pendingInvitation) {
    return { ok: false, error: "invitations.errors.alreadyInvited" };
  }

  if (input.campaignId) {
    const role = await getCampaignRole(input.invitedById, input.campaignId);
    if (role !== CampaignRole.DM) {
      return { ok: false, error: "invitations.errors.forbidden" };
    }
  }

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = invitationExpiresAt(now);

  try {
    const created = await prisma.invitation.create({
      data: {
        email,
        tokenHash,
        campaignId: input.campaignId ?? null,
        role: input.role ?? null,
        invitedById: input.invitedById,
        expiresAt,
      },
      select: INVITATION_ROW_SELECT,
    });

    return {
      ok: true,
      invitation: toInvitationDto(created, now),
      token,
    };
  } catch (error) {
    console.error("[INVITATIONS/CREATE] Failed to create invitation:", error);
    return { ok: false, error: "invitations.errors.unknown" };
  }
}

/**
 * Lists the invitations a user has sent, newest first, each with its derived
 * status. Never exposes `tokenHash`.
 *
 * @param {string} userId - Id of the inviting user.
 * @returns {Promise<InvitationDto[]>} The user's sent invitations.
 */
export async function listInvitations(userId: string): Promise<InvitationDto[]> {
  const now = new Date();
  const rows = await prisma.invitation.findMany({
    where: { invitedById: userId },
    select: INVITATION_ROW_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => toInvitationDto(row, now));
}

/** Result of an invitation mutation. `error` holds an i18n key on failure. */
export type InvitationMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Revokes an invitation. Only its inviter may revoke it; an already-accepted
 * invitation cannot be revoked. Idempotent: revoking an already-revoked
 * invitation succeeds again rather than erroring.
 *
 * @param {string} id - Id of the invitation to revoke.
 * @param {string} userId - Id of the user attempting the revoke.
 * @returns {Promise<InvitationMutationResult>} Success, or an error key
 *   (`invitations.errors.notFound` / `forbidden` / `alreadyAccepted` / `unknown`).
 */
export async function revokeInvitation(
  id: string,
  userId: string,
): Promise<InvitationMutationResult> {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { id },
      select: { invitedById: true },
    });
    if (!invitation) {
      return { ok: false, error: "invitations.errors.notFound" };
    }
    if (invitation.invitedById !== userId) {
      return { ok: false, error: "invitations.errors.forbidden" };
    }

    const result = await prisma.invitation.updateMany({
      where: { id, acceptedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false, error: "invitations.errors.alreadyAccepted" };
    }

    return { ok: true, id };
  } catch (error) {
    console.error("[INVITATIONS/REVOKE] Failed to revoke invitation:", error);
    return { ok: false, error: "invitations.errors.unknown" };
  }
}

/** What the public accept page needs to render, for a token that resolved to a row. */
export type InvitationForToken = {
  email: string;
  campaign: { id: string; name: string; tag: string } | null;
  role: CampaignRole | null;
  status: InvitationStatus;
};

/** Result of resolving a raw token. `error` holds an i18n key on failure. */
export type InvitationLookupResult =
  | { ok: true; invitation: InvitationForToken }
  | { ok: false; error: string };

/**
 * Resolves a raw invitation token (from the `/invite/[token]` URL) to its
 * current state. A token that matches no stored hash — malformed, tampered,
 * or simply never existed — collapses to the same generic `invalid` error as
 * any other lookup miss, so a forged token cannot be used to probe which
 * hashes exist.
 *
 * @param {string} rawToken - The raw token from the URL path segment.
 * @returns {Promise<InvitationLookupResult>} The invitation's public state, or
 *   `invitations.errors.invalid` when the token matches nothing.
 */
export async function getInvitationForToken(
  rawToken: string,
): Promise<InvitationLookupResult> {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    select: INVITATION_ROW_SELECT,
  });

  if (!invitation) {
    return { ok: false, error: "invitations.errors.invalid" };
  }

  const now = new Date();
  return {
    ok: true,
    invitation: {
      email: invitation.email,
      campaign: invitation.campaign,
      role: invitation.role,
      status: invitationStatus(invitation, now),
    },
  };
}

/** Thrown internally to abort `acceptInvitation`'s transaction on a lost race. */
class InvitationRaceLostError extends Error {}

/** Result of accepting an invitation. `error` holds an i18n key on failure. */
export type AcceptInvitationResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/**
 * Accepts a pending invitation: creates the account (email fixed by the
 * invitation, never by the caller), optionally joins the invitation's
 * campaign with its role, and consumes the invitation — all inside one
 * transaction, so a lost race (someone else accepting or revoking the same
 * link at the same moment) rolls back the freshly created account too instead
 * of leaving an orphaned user with no consumed invitation.
 *
 * @param {{ rawToken: string; name: string; password: string }} input -
 *   Already Zod-validated accept payload plus the raw token from the URL.
 * A campaign invitation additionally revalidates that its sender still holds
 * the DM role there: the link outlives the authority that created it by up to
 * seven days.
 *
 * @returns {Promise<AcceptInvitationResult>} Success with the new account's
 *   email (for the caller to `signIn` with), or an error key
 *   (`invitations.errors.invalid` / `expired` / `revoked` / `alreadyAccepted` /
 *   `issuerNoLongerDm` / `auth.errors.emailTaken` / `invitations.errors.unknown`).
 */
export async function acceptInvitation(input: {
  rawToken: string;
  name: string;
  password: string;
}): Promise<AcceptInvitationResult> {
  const tokenHash = hashInvitationToken(input.rawToken);

  try {
    return await prisma.$transaction(async (tx): Promise<AcceptInvitationResult> => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          email: true,
          campaignId: true,
          role: true,
          invitedById: true,
          acceptedAt: true,
          revokedAt: true,
          expiresAt: true,
        },
      });
      if (!invitation) {
        return { ok: false, error: "invitations.errors.invalid" };
      }

      const status = invitationStatus(invitation, new Date());
      if (status !== "pending") {
        const error =
          status === "accepted" ? "invitations.errors.alreadyAccepted" : `invitations.errors.${status}`;
        return { ok: false, error };
      }

      // The sender's authority is checked when the invitation is issued, and
      // it was never checked again — but the link stays usable for seven days,
      // and DM rights can be gone well before then. A DM could invite someone
      // into a campaign as a DM, be removed from that campaign, and the link
      // would still hand out the role they chose: a way back into a campaign
      // they no longer belong to, with full control of it. The same thing
      // happens without any ill intent when a DM simply leaves and their
      // outstanding invitations are redeemed afterwards.
      //
      // Read through `tx` so the answer cannot go stale between here and the
      // membership write below.
      if (invitation.campaignId) {
        const issuerRole = await getCampaignRole(
          invitation.invitedById,
          invitation.campaignId,
          tx,
        );
        if (issuerRole !== CampaignRole.DM) {
          // Refused whole rather than degraded to an account without the
          // campaign: access is invitation-only, so minting the account is
          // itself the grant, and a silent partial join would leave the person
          // wondering why the campaign never appeared. A current DM can send a
          // fresh link.
          return { ok: false, error: "invitations.errors.issuerNoLongerDm" };
        }
      }

      const created = await registerUser(
        { name: input.name, email: invitation.email, password: input.password },
        tx,
      );
      if (!created.ok) {
        return created;
      }

      if (invitation.campaignId) {
        await tx.campaignPlayer.create({
          data: {
            campaignId: invitation.campaignId,
            userId: created.userId,
            role: invitation.role ?? CampaignRole.PLAYER,
          },
        });
      }

      const consumed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedById: created.userId },
      });
      if (consumed.count === 0) {
        // Someone else accepted or revoked this link between our read above
        // and this write — abort so the just-created user rolls back too.
        throw new InvitationRaceLostError();
      }

      return { ok: true, email: invitation.email };
    });
  } catch (error) {
    if (error instanceof InvitationRaceLostError) {
      return { ok: false, error: "invitations.errors.alreadyAccepted" };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      return { ok: false, error: "auth.errors.emailTaken" };
    }

    console.error("[INVITATIONS/ACCEPT] Failed to accept invitation:", error);
    return { ok: false, error: "invitations.errors.unknown" };
  }
}
