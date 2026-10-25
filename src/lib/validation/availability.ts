import { z } from "zod";

import { AVAILABILITY_HORIZON_OPTIONS } from "@/lib/availabilityHorizon";
import { isValidIsoDate } from "@/lib/date";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * A single availability date, taken from the `[date]` route segment. It must be
 * a real "YYYY-MM-DD" calendar day. Eligibility (Friday, weekend or holiday) is
 * *not* checked here — it needs the holiday set from the database — so the API
 * route enforces it separately before writing.
 */
export const availabilityDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "availability.errors.invalidDate" })
  .refine(isValidIsoDate, { error: "availability.errors.invalidDate" });

/**
 * Body for setting an availability response. YES, NO, MAYBE ("Tal vez") and
 * ONLINE ("Sí (Online)") are all valid stored answers; only the pending state
 * stays derived from the absence of a row (clearing deletes it). The UI can only
 * ever send one of the four, so a malformed status maps to the generic unknown
 * error rather than a dedicated key.
 */
export const availabilityBodySchema = z.object({
  status: z.enum(["YES", "NO", "MAYBE", "ONLINE"], {
    error: "availability.errors.unknown",
  }),
});

export type AvailabilityBodyInput = z.infer<typeof availabilityBodySchema>;

/**
 * How many months "Mi disponibilidad" lists. Only the offered options are
 * accepted, and the smallest one is the default window, so no value can make
 * the list shorter than the default.
 */
export const availabilityHorizonSchema = z.literal(AVAILABILITY_HORIZON_OPTIONS, {
  error: "availability.errors.invalidHorizon",
});

/**
 * State returned by the availability server actions to the client.
 * `error` holds an i18n key when the update fails, translated client-side.
 */
export type AvailabilityActionState = { error?: string };
