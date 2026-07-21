import { z } from "zod";

import { isValidIsoDate } from "@/lib/date";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * A single availability date, taken from the `[date]` route segment. It must be
 * a real "YYYY-MM-DD" calendar day. Eligibility (weekend or holiday) is *not*
 * checked here — it needs the holiday set from the database — so the API route
 * enforces it separately before writing.
 */
export const availabilityDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "availability.errors.invalidDate" })
  .refine(isValidIsoDate, { error: "availability.errors.invalidDate" });

/**
 * Body for setting an availability response. YES, NO and MAYBE ("Tal vez") are
 * all valid stored answers; only the pending state stays derived from the
 * absence of a row (clearing deletes it). The UI can only ever send one of the
 * three, so a malformed status maps to the generic unknown error rather than a
 * dedicated key.
 */
export const availabilityBodySchema = z.object({
  status: z.enum(["YES", "NO", "MAYBE"], { error: "availability.errors.unknown" }),
});

export type AvailabilityBodyInput = z.infer<typeof availabilityBodySchema>;
