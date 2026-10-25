"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { updateUserAvailabilityHorizon } from "@/lib/userService";
import {
  type AvailabilityActionState,
  availabilityHorizonSchema,
} from "@/lib/validation/availability";

/**
 * Persists how many months the current user's "Mi disponibilidad" list covers,
 * then revalidates the page so the list re-renders with the new range in the
 * same roundtrip. Called directly from `HorizonSelector`, which has already
 * shown the new choice and puts the previous one back on an error.
 *
 * @param {unknown} months - Candidate horizon from the client.
 * @returns {Promise<AvailabilityActionState>} An error key on failure, or empty on success.
 */
export async function updateAvailabilityHorizon(
  months: unknown,
): Promise<AvailabilityActionState> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const parsed = availabilityHorizonSchema.safeParse(months);
  if (!parsed.success) {
    return { error: "availability.errors.invalidHorizon" };
  }

  const result = await updateUserAvailabilityHorizon(session.user.id, parsed.data);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/availability");
  return {};
}
