import { z } from "zod";

import { EMAIL_MAX_LENGTH, fitsPasswordLimit, NAME_MAX_LENGTH } from "../src/lib/validation/auth";
import { CAMPAIGN_NAME_MAX_LENGTH } from "../src/lib/validation/campaign";
import { SAFE_NAME_PATTERN } from "../src/lib/validation/invitation";

/**
 * Minimum length for the bootstrap account's password. Stricter than the
 * app's own minimum because this account is the first DM of the deployment —
 * the one every later invitation traces back to.
 */
const MIN_SEED_PASSWORD_LENGTH = 12;

/**
 * Values shipped in .env.example as placeholders. They are published in the
 * repository, so any of them used verbatim is a known password, not a secret —
 * and a schema that only checks length would happily accept them.
 */
const TEMPLATE_PLACEHOLDERS = ["change_me", "change_me_seed", "changeme", "password"];

/**
 * Everything the seed writes comes from here rather than from the source, so
 * the repository holds no one's email or name — the bootstrap account invites
 * everybody else from the app. Field rules mirror the ones the app applies to
 * the same values (invitation acceptance and campaign creation).
 */
export const seedEnvSchema = z.object({
  DATABASE_URL: z.url(),
  SEED_USER_EMAIL: z
    .email({ error: "SEED_USER_EMAIL must be a valid email address" })
    .max(EMAIL_MAX_LENGTH, {
      error: `SEED_USER_EMAIL must be at most ${EMAIL_MAX_LENGTH} characters`,
    })
    // Login and invitations lowercase the email before looking it up, so an
    // account stored with capitals could never sign in.
    .transform((email) => email.toLowerCase()),
  SEED_USER_NAME: z
    .string()
    .trim()
    .min(1, { error: "SEED_USER_NAME is required" })
    .max(NAME_MAX_LENGTH, { error: `SEED_USER_NAME must be at most ${NAME_MAX_LENGTH} characters` })
    .regex(SAFE_NAME_PATTERN, {
      error: "SEED_USER_NAME may only contain letters, digits, spaces and ' ’ · . , - ( )",
    }),
  SEED_USER_PASSWORD: z
    .string()
    .min(MIN_SEED_PASSWORD_LENGTH, {
      error: `SEED_USER_PASSWORD must be at least ${MIN_SEED_PASSWORD_LENGTH} characters`,
    })
    .refine(fitsPasswordLimit, {
      error: "SEED_USER_PASSWORD must be at most 72 bytes — bcrypt ignores anything beyond that",
    })
    .refine((value) => !TEMPLATE_PLACEHOLDERS.includes(value.trim().toLowerCase()), {
      error:
        "SEED_USER_PASSWORD is still a placeholder from .env.example, which is published in the repository",
    }),
  SEED_CAMPAIGN_NAME: z
    .string({ error: "SEED_CAMPAIGN_NAME is required" })
    .trim()
    .min(1, { error: "SEED_CAMPAIGN_NAME is required" })
    .max(CAMPAIGN_NAME_MAX_LENGTH, {
      error: `SEED_CAMPAIGN_NAME must be at most ${CAMPAIGN_NAME_MAX_LENGTH} characters`,
    }),
  SEED_CAMPAIGN_TAG: z
    .string({ error: "SEED_CAMPAIGN_TAG is required" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}$/, { error: "SEED_CAMPAIGN_TAG must be exactly 2 letters or digits" }),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;

/**
 * Validates the environment variables required by the seed script, failing
 * fast with a readable error when one is missing or malformed. Kept out of
 * src/lib/env.ts because the SEED_* values are only needed at seed time and
 * must not be required at application runtime.
 *
 * @returns {SeedEnv} The validated seed environment.
 * @throws {Error} If a required environment variable is invalid.
 */
export function loadSeedEnv(): SeedEnv {
  const result = seedEnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      `[SEED/ENV] Invalid environment variables:\n${z.prettifyError(result.error)}`
    );
    throw new Error("Invalid seed environment variables. See logs for details.");
  }

  return result.data;
}
