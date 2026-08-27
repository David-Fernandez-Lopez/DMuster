import { z } from "zod";

/**
 * Minimum length for the seeded password. The seed gives every account the
 * same one, so it is a single credential guarding all of them at once — the
 * moment it is guessed, every account falls together, including the ones
 * holding the DM role. Rotate it per account after seeding
 * (scripts/ops/rotatePasswords.ts); the length here is only the floor for the
 * window before that happens.
 */
const MIN_SEED_PASSWORD_LENGTH = 12;

/**
 * Values shipped in .env.example as placeholders. They are published in the
 * repository, so any of them used verbatim is a known password, not a secret —
 * and a schema that only checks length would happily accept them.
 */
const TEMPLATE_PLACEHOLDERS = ["change_me", "change_me_seed", "changeme", "password"];

export const seedEnvSchema = z.object({
  DATABASE_URL: z.url(),
  SEED_DEFAULT_PASSWORD: z
    .string()
    .min(MIN_SEED_PASSWORD_LENGTH, {
      error: `SEED_DEFAULT_PASSWORD must be at least ${MIN_SEED_PASSWORD_LENGTH} characters — it is the password for every seeded account at once`,
    })
    .refine((value) => !TEMPLATE_PLACEHOLDERS.includes(value.trim().toLowerCase()), {
      error:
        "SEED_DEFAULT_PASSWORD is still a placeholder from .env.example, which is published in the repository",
    }),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;

/**
 * Validates the environment variables required by the seed script, failing
 * fast with a readable error when one is missing or malformed. Kept out of
 * src/lib/env.ts because SEED_DEFAULT_PASSWORD is only needed at seed time and
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
