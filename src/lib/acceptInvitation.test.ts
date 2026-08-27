import { CampaignRole } from "@/generated/prisma/enums";
import { getCampaignRole } from "@/lib/authz";
import { acceptInvitation } from "@/lib/invitationService";
import { prisma } from "@/lib/prisma";
import { registerUser } from "@/lib/userService";

// The generated client is ESM (`import.meta.url`) and ts-jest cannot parse it;
// only the error class is reached from these paths.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock("@/lib/authz", () => ({ getCampaignRole: jest.fn() }));
jest.mock("@/lib/userService", () => ({ registerUser: jest.fn() }));

const transaction = prisma.$transaction as unknown as jest.Mock;
const campaignRole = getCampaignRole as jest.Mock;
const createUser = registerUser as jest.Mock;

/** Transaction client stub, rebuilt per test so call counts stay isolated. */
let tx: {
  invitation: { findUnique: jest.Mock; updateMany: jest.Mock };
  campaignPlayer: { create: jest.Mock };
};

/**
 * Arranges a pending invitation for the transaction to find.
 *
 * @param {object} overrides - Fields to override on the default invitation.
 */
function pendingInvitation(overrides: Record<string, unknown> = {}): void {
  tx.invitation.findUnique.mockResolvedValue({
    id: "inv-1",
    email: "nuevo@dmuster.local",
    campaignId: "campaign-1",
    role: CampaignRole.DM,
    invitedById: "issuer-1",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

/** Runs `acceptInvitation` with a throwaway token and payload. */
function accept() {
  return acceptInvitation({
    rawToken: "raw-token",
    name: "Nuevo",
    password: "una-contrasena-larga",
  });
}

describe("acceptInvitation — issuer authority", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      invitation: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      campaignPlayer: { create: jest.fn().mockResolvedValue({}) },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    createUser.mockResolvedValue({ ok: true, userId: "user-1" });
  });

  // The link outlives the authority that created it by up to seven days. A DM
  // could issue a DM-role invitation, be removed from the campaign, and the
  // link would still hand out that role — a way back into a campaign they no
  // longer belong to, with full control of it.
  describe("when the sender has lost the DM role", () => {
    beforeEach(() => {
      pendingInvitation();
      campaignRole.mockResolvedValue(CampaignRole.PLAYER);
    });

    it("refuses the invitation", async () => {
      await expect(accept()).resolves.toEqual({
        ok: false,
        error: "invitations.errors.issuerNoLongerDm",
      });
    });

    it("creates no account and no membership", async () => {
      await accept();

      expect(createUser).not.toHaveBeenCalled();
      expect(tx.campaignPlayer.create).not.toHaveBeenCalled();
      expect(tx.invitation.updateMany).not.toHaveBeenCalled();
    });
  });

  it("refuses when the sender is no longer a member at all", async () => {
    pendingInvitation();
    campaignRole.mockResolvedValue(null);

    await expect(accept()).resolves.toEqual({
      ok: false,
      error: "invitations.errors.issuerNoLongerDm",
    });
  });

  describe("when the sender is still a DM", () => {
    beforeEach(() => {
      pendingInvitation();
      campaignRole.mockResolvedValue(CampaignRole.DM);
    });

    it("accepts and grants the invitation's role", async () => {
      await expect(accept()).resolves.toEqual({ ok: true, email: "nuevo@dmuster.local" });
      expect(tx.campaignPlayer.create).toHaveBeenCalledWith({
        data: { campaignId: "campaign-1", userId: "user-1", role: CampaignRole.DM },
      });
    });

    it("reads the role through the transaction, not a separate connection", async () => {
      await accept();

      expect(campaignRole).toHaveBeenCalledWith("issuer-1", "campaign-1", tx);
    });
  });

  it("skips the check for an account-only invitation", async () => {
    pendingInvitation({ campaignId: null, role: null });

    await expect(accept()).resolves.toEqual({ ok: true, email: "nuevo@dmuster.local" });
    expect(campaignRole).not.toHaveBeenCalled();
    expect(tx.campaignPlayer.create).not.toHaveBeenCalled();
  });
});
