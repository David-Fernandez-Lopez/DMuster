import { z } from "zod";

import { isValidIsoDate } from "@/lib/date";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/** Maximum session length accepted, in minutes (24h). */
export const MAX_DURATION_MINUTES = 1440;

/** Matches a strict "HH:MM" 24h wall-clock time. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const startTimeField = z
  .string()
  .regex(TIME_PATTERN, { error: "sessions.errors.invalidTime" })
  .nullish();

const durationMinutesField = z
  .number()
  .int({ error: "sessions.errors.invalidDuration" })
  .positive({ error: "sessions.errors.invalidDuration" })
  .max(MAX_DURATION_MINUTES, { error: "sessions.errors.invalidDuration" })
  .nullish();

/**
 * Payload for confirming a session: which campaign, which day, and an
 * optional start time + duration. A duration only makes sense together with a
 * start time (no time ⇒ an all-day session), so the pair is refined together.
 */
export const confirmSessionSchema = z
  .object({
    campaignId: z.string().trim().min(1, { error: "sessions.errors.validation" }),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "sessions.errors.invalidDate" })
      .refine(isValidIsoDate, { error: "sessions.errors.invalidDate" }),
    startTime: startTimeField,
    durationMinutes: durationMinutesField,
  })
  .refine((data) => data.durationMinutes == null || data.startTime != null, {
    error: "sessions.errors.durationWithoutTime",
    path: ["durationMinutes"],
  });

export type ConfirmSessionInput = z.infer<typeof confirmSessionSchema>;

/**
 * Payload for editing an existing session's time. A full replace of both
 * fields (not a partial patch): omitting a field clears it, which is how a
 * timed session is turned back into an all-day one. Same duration-requires-time
 * refinement as `confirmSessionSchema`.
 */
export const updateSessionSchema = z
  .object({
    startTime: startTimeField.default(null),
    durationMinutes: durationMinutesField.default(null),
  })
  .refine((data) => data.durationMinutes == null || data.startTime != null, {
    error: "sessions.errors.durationWithoutTime",
    path: ["durationMinutes"],
  });

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
