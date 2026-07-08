import { z } from "zod";

import { isValidIsoDate, isWeekend } from "@/lib/date";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/**
 * Payload for creating a holiday: a single calendar date. It must be a real
 * "YYYY-MM-DD" day and must not be a weekend (weekends are already eligible and
 * are never stored). Past dates are allowed — a historical holiday is harmless.
 */
export const holidaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "holidays.errors.invalidDate" })
    .refine(isValidIsoDate, { error: "holidays.errors.invalidDate" })
    .refine((value) => !isWeekend(value), { error: "holidays.errors.weekend" }),
});

export type HolidayInput = z.infer<typeof holidaySchema>;
