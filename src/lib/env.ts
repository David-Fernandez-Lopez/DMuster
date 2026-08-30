import { z } from "zod";

import { type Env, envSchema } from "@/lib/envSchema";

export type { Env };

/**
 * Parses and validates `process.env` against the application schema, failing
 * fast with a readable error when a required variable is missing or malformed.
 * Skipped when `SKIP_ENV_VALIDATION` is set, which the Docker builder stage
 * does since no real secrets are available at build time.
 *
 * @returns {Env} The validated, typed environment.
 * @throws {Error} If one or more environment variables are invalid.
 */
function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION) {
    return process.env as unknown as Env;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      `[ENV/VALIDATION] Invalid environment variables:\n${z.prettifyError(result.error)}`
    );
    throw new Error("Invalid environment variables. See server logs for details.");
  }

  return result.data;
}

// Runs at import time on purpose: a deployment missing a variable should fail
// on startup, not on whichever request happens to need it first.
export const env = loadEnv();

/**
 * True when every variable required to run the Google OAuth consent flow is
 * present. Gates the `/profile` integration UI and the
 * `/api/integrations/google/*` routes (404 when false) so a deployment that
 * never set up Google Cloud credentials is entirely unaffected.
 *
 * @returns {boolean} Whether Google Calendar sync can be offered.
 */
export const isGoogleSyncConfigured: boolean = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI
);
