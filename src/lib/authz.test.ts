import { CampaignRole } from "@/generated/prisma/enums";
import { isDmOfAnyCampaign } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { campaignPlayer: { count: jest.fn() } },
}));

const count = prisma.campaignPlayer.count as jest.Mock;

describe("isDmOfAnyCampaign", () => {
  beforeEach(() => {
    count.mockReset();
  });

  describe("denies a missing user id", () => {
    // This is the one place in the authorization core where a malformed input
    // would *grant* rather than refuse: Prisma reads `undefined` in a `where`
    // clause as "no filter", so the count would return every DM membership in
    // the instance and the guard would answer true. Denying without querying is
    // what makes that impossible rather than merely unlikely.
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["an empty string", ""],
    ])("refuses %s without querying the database", async (_label, userId) => {
      const result = await isDmOfAnyCampaign(userId as unknown as string);

      expect(result).toBe(false);
      expect(count).not.toHaveBeenCalled();
    });
  });

  describe("with a real user id", () => {
    it("grants when the user holds the DM role somewhere", async () => {
      count.mockResolvedValue(2);

      await expect(isDmOfAnyCampaign("user-1")).resolves.toBe(true);
      expect(count).toHaveBeenCalledWith({
        where: { userId: "user-1", role: CampaignRole.DM },
      });
    });

    it("refuses when the user is DM of nothing", async () => {
      count.mockResolvedValue(0);

      await expect(isDmOfAnyCampaign("user-1")).resolves.toBe(false);
    });
  });
});
