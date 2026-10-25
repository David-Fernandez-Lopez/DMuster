import { z } from "zod";

// Validation error messages are i18n keys, not user-facing text: the client
// resolves them through `t(...)` so no copy is ever hardcoded here.

/** Maximum length accepted for a campaign name. */
export const CAMPAIGN_NAME_MAX_LENGTH = 100;

/** Exact length of a campaign tag (the two-letter chip label). */
export const CAMPAIGN_TAG_LENGTH = 2;

/** Maximum length accepted for a campaign description. */
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Campaign create/update payload. `PUT` is a full replace, so the same schema
 * validates both. The tag is uppercased before validation (users can type
 * "ac" and get "AC" stored), and an empty description normalizes to `null`.
 */
export const campaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "campaigns.errors.nameRequired" })
    .max(CAMPAIGN_NAME_MAX_LENGTH, { error: "campaigns.errors.nameTooLong" }),
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}$/, { error: "campaigns.errors.tagInvalid" }),
  description: z
    .string()
    .trim()
    .max(CAMPAIGN_DESCRIPTION_MAX_LENGTH, {
      error: "campaigns.errors.descriptionTooLong",
    })
    .transform((value) => (value === "" ? null : value))
    .nullish(),
});

export type CampaignInput = z.infer<typeof campaignSchema>;

/**
 * Payload for adding/removing a member of a campaign. Both the `POST` and
 * `DELETE` handlers on `/api/campaigns/[id]/players` carry the target user in
 * the JSON body, so the same schema validates both.
 */
export const campaignPlayerSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1, { error: "campaigns.players.errors.validation" }),
});

export type CampaignPlayerInput = z.infer<typeof campaignPlayerSchema>;

/**
 * Upper bound on the ids accepted in a requirements payload — far above any
 * real campaign, only there so a crafted body cannot make the server walk an
 * unbounded list.
 */
export const CAMPAIGN_REQUIREMENTS_MAX_IDS = 200;

/**
 * Payload for `PUT /api/campaigns/[id]/requirements` (roadmap #25): which
 * players are required for the next session, and the minimum number of players
 * who must be able to play (`null` for none). Whether the ids are actually
 * players of the campaign is checked by the service, against the database.
 */
export const campaignRequirementsSchema = z.object({
  requiredUserIds: z
    .array(
      z.string().trim().min(1, { error: "campaigns.requirements.errors.validation" }),
    )
    .max(CAMPAIGN_REQUIREMENTS_MAX_IDS, {
      error: "campaigns.requirements.errors.validation",
    }),
  minPlayers: z
    .number({ error: "campaigns.requirements.errors.minPlayersInvalid" })
    .int({ error: "campaigns.requirements.errors.minPlayersInvalid" })
    .min(1, { error: "campaigns.requirements.errors.minPlayersInvalid" })
    .max(CAMPAIGN_REQUIREMENTS_MAX_IDS, {
      error: "campaigns.requirements.errors.minPlayersInvalid",
    })
    .nullable(),
});

export type CampaignRequirementsInput = z.infer<typeof campaignRequirementsSchema>;

/**
 * State shared by the campaign form (client) to surface validation results.
 * `error` is a top-level i18n key; `fieldErrors` maps a field name to an i18n
 * key. Both are translated on the client — never user-facing text.
 */
export type CampaignFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
