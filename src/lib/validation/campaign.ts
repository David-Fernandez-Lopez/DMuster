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
 * State shared by the campaign form (client) to surface validation results.
 * `error` is a top-level i18n key; `fieldErrors` maps a field name to an i18n
 * key. Both are translated on the client — never user-facing text.
 */
export type CampaignFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};
