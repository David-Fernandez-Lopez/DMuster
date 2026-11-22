import { z } from "zod";

import { DICE_SKILL_MAX_LENGTH, normalizeSkill } from "@/lib/diceSkill";
import { isValidIsoDate } from "@/lib/date";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/** Maximum length accepted for an arc name. */
export const ARC_NAME_MAX_LENGTH = 80;

/** Page size bounds for the dice event list. */
export const DICE_EVENT_DEFAULT_PAGE_SIZE = 25;
export const DICE_EVENT_MAX_PAGE_SIZE = 100;

/** Optional-id helper: an empty string or null means "none". */
const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullish();

/**
 * Create/update payload for a critical or fumble. `PUT` is a full replace, so
 * the same schema validates both. The skill is normalised here, so what the
 * service stores is already canonical; an empty time normalises to `null`.
 * Rejecting future dates needs "today", so the service does it.
 */
export const diceEventSchema = z.object({
  userId: z.string().trim().min(1, { error: "diceEvents.errors.playerRequired" }),
  kind: z.enum(["CRITICAL", "FUMBLE"], { error: "diceEvents.errors.kindInvalid" }),
  skill: z
    .string({ error: "diceEvents.errors.skillRequired" })
    .max(DICE_SKILL_MAX_LENGTH * 2, { error: "diceEvents.errors.skillTooLong" })
    .transform(normalizeSkill)
    .pipe(
      z
        .string()
        .min(1, { error: "diceEvents.errors.skillRequired" })
        .max(DICE_SKILL_MAX_LENGTH, { error: "diceEvents.errors.skillTooLong" }),
    ),
  date: z
    .string({ error: "diceEvents.errors.dateInvalid" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "diceEvents.errors.dateInvalid" })
    .refine(isValidIsoDate, { error: "diceEvents.errors.dateInvalid" }),
  time: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(
      z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "diceEvents.errors.timeInvalid" })
        .nullable(),
    )
    .nullish(),
  arcId: optionalId,
  sessionId: optionalId,
});

export type DiceEventInput = z.infer<typeof diceEventSchema>;

/**
 * Query-string filters of the dice event list. Everything is optional; `page`
 * and `pageSize` are coerced from strings and clamped to sane bounds.
 */
export const diceEventFilterSchema = z.object({
  campaignId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  kind: z.enum(["CRITICAL", "FUMBLE"]).optional(),
  arcId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(DICE_EVENT_MAX_PAGE_SIZE)
    .catch(DICE_EVENT_DEFAULT_PAGE_SIZE)
    .default(DICE_EVENT_DEFAULT_PAGE_SIZE),
});

export type DiceEventFilters = z.infer<typeof diceEventFilterSchema>;

/**
 * Create/update payload for a campaign arc. The number is assigned by the
 * service (next free one), so only the optional name travels.
 */
export const campaignArcSchema = z.object({
  name: z
    .string()
    .trim()
    .max(ARC_NAME_MAX_LENGTH, { error: "arcs.errors.nameTooLong" })
    .transform((value) => (value === "" ? null : value))
    .nullish(),
});

export type CampaignArcInput = z.infer<typeof campaignArcSchema>;
