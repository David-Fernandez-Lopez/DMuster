import { revokeAccess } from "@/lib/google/oauth";
import { prisma } from "@/lib/prisma";

jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findFirst: jest.fn(), delete: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock("@/lib/env", () => ({
  env: {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/cb",
  },
  isGoogleSyncConfigured: true,
}));

const findAccount = prisma.account.findFirst as jest.Mock;

/** Stands in for the fetch to Google's revoke endpoint. */
let revokeCall: jest.Mock;

describe("revokeAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    findAccount.mockResolvedValue({
      providerAccountId: "google-123",
      refresh_token: "a-refresh-token",
      access_token: "an-access-token",
    });
    revokeCall = jest.fn();
    global.fetch = revokeCall as unknown as typeof fetch;
  });

  it("reports both sides done when Google accepts the revocation", async () => {
    revokeCall.mockResolvedValue({ ok: true, status: 200 });

    await expect(revokeAccess("user-1")).resolves.toEqual({
      disconnected: true,
      revokedAtGoogle: true,
    });
  });

  it("treats a 400 as revoked, since the token was already dead", async () => {
    revokeCall.mockResolvedValue({ ok: false, status: 400 });

    await expect(revokeAccess("user-1")).resolves.toEqual({
      disconnected: true,
      revokedAtGoogle: true,
    });
  });

  // The half that used to be reported as success. The app forgets the
  // connection either way, but the grant is still standing on Google's side and
  // only the person can withdraw it now — so they have to be told.
  it("says the token is still live when Google cannot be reached", async () => {
    revokeCall.mockRejectedValue(new Error("network down"));

    await expect(revokeAccess("user-1")).resolves.toEqual({
      disconnected: true,
      revokedAtGoogle: false,
    });
  });

  it("says the token is still live on an unexpected status", async () => {
    revokeCall.mockResolvedValue({ ok: false, status: 500 });

    await expect(revokeAccess("user-1")).resolves.toEqual({
      disconnected: true,
      revokedAtGoogle: false,
    });
  });

  it("disconnects locally even when the revocation failed", async () => {
    revokeCall.mockRejectedValue(new Error("network down"));

    await revokeAccess("user-1");

    // A token Google never hears from again is inert; refusing to disconnect
    // locally would only trap the person in a connection they asked to leave.
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("reports a clean result when there was nothing connected", async () => {
    findAccount.mockResolvedValue(null);

    await expect(revokeAccess("user-1")).resolves.toEqual({
      disconnected: true,
      revokedAtGoogle: true,
    });
    expect(revokeCall).not.toHaveBeenCalled();
  });
});
