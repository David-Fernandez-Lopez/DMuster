import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.url(),
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.url().optional(),
    DEFAULT_LOCALE: z.enum(["es", "en"]).default("es"),
    // Google Calendar sync (roadmap #23) — optional. Unset means the app boots
    // normally and the profile hides the integration entirely; see
    // `isGoogleSyncConfigured` below.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.url().optional(),
    // Wall-clock timezone confirmed sessions are stored in (IANA name). Sent to
    // the Google Calendar API alongside each event's local time so Google
    // resolves the instant, avoiding any DST math in the app.
    APP_TIMEZONE: z.string().min(1).default("Europe/Madrid"),
    // Shared secret for the optional POST /api/cron/calendar-sync sweeper.
    // Unset disables that route entirely (404).
    CRON_SECRET: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.AUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_URL"],
        message: "AUTH_URL is required in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

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
