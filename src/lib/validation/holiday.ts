import { z } from "zod";

import { isRegularPlayDay, isValidIsoDate } from "@/lib/date";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * Payload for creating a holiday: a single calendar date. It must be a real
 * "YYYY-MM-DD" day and must not be a Friday or weekend (those are already
 * eligible and are never stored). Past dates are allowed — a historical holiday
 * is harmless.
 */
export const holidaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "holidays.errors.invalidDate" })
    .refine(isValidIsoDate, { error: "holidays.errors.invalidDate" })
    .refine((value) => !isRegularPlayDay(value), {
      error: "holidays.errors.regularPlayDay",
    }),
});

export type HolidayInput = z.infer<typeof holidaySchema>;
