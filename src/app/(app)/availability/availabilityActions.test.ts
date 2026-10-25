import { updateAvailabilityHorizon } from "@/app/(app)/availability/actions";
import { auth } from "@/lib/auth";
import { updateUserAvailabilityHorizon } from "@/lib/userService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/userService", () => ({ updateUserAvailabilityHorizon: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    // The real `redirect` never returns; throwing keeps the control flow of the
    // action under test honest.
    throw new Error("NEXT_REDIRECT");
  }),
}));

const session = auth as unknown as jest.Mock;
const updateHorizon = updateUserAvailabilityHorizon as jest.Mock;
const revalidate = revalidatePath as jest.Mock;
const redirectTo = redirect as unknown as jest.Mock;

describe("updateAvailabilityHorizon", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session.mockResolvedValue({ user: { id: "user-1" } });
    updateHorizon.mockResolvedValue({ ok: true });
  });

  it("saves a supported horizon and revalidates the list", async () => {
    await expect(updateAvailabilityHorizon(6)).resolves.toEqual({});

    expect(updateHorizon).toHaveBeenCalledWith("user-1", 6);
    expect(revalidate).toHaveBeenCalledWith("/availability");
  });

  it.each([1, 5, 13, "6", null])(
    "rejects %p without touching the profile",
    async (months) => {
      await expect(updateAvailabilityHorizon(months)).resolves.toEqual({
        error: "availability.errors.invalidHorizon",
      });

      expect(updateHorizon).not.toHaveBeenCalled();
      expect(revalidate).not.toHaveBeenCalled();
    },
  );

  it("passes a failed save through without revalidating", async () => {
    updateHorizon.mockResolvedValue({ ok: false, error: "availability.errors.unknown" });

    await expect(updateAvailabilityHorizon(3)).resolves.toEqual({
      error: "availability.errors.unknown",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("sends an anonymous caller to the login page", async () => {
    session.mockResolvedValue(null);

    await expect(updateAvailabilityHorizon(6)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectTo).toHaveBeenCalledWith("/login");
    expect(updateHorizon).not.toHaveBeenCalled();
  });
});
