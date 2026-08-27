import { z } from "zod";

/**
 * Treats an empty string the same as an unset variable before the inner
 * schema sees it. A blank ".env" line (`KEY=`, exactly what `.env.example`
 * shows for every optional Google/cron var) is parsed as `""`, not
 * `undefined` — without this, leaving one blank would fail validation
 * instead of just leaving the feature it gates disabled.
 *
 * @param {unknown} value - The raw value read from `process.env`.
 * @returns {unknown} `undefined` when the value is an empty string, else the value unchanged.
 */
function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

/**
 * Reports whether a string is an IANA timezone the runtime recognises. Asked by
 * constructing a formatter and seeing whether it throws, which is the only
 * check guaranteed to agree with the `Intl` calls that will use the value.
 *
 * @param {string} timeZone - Candidate IANA timezone name.
 * @returns {boolean} True when `Intl` accepts it.
 */
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

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
    GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    GOOGLE_OAUTH_REDIRECT_URI: z.preprocess(emptyToUndefined, z.url().optional()),
    // Wall-clock timezone the application lives in (IANA name). Sent to the
    // Google Calendar API alongside each event's local time so Google resolves
    // the instant, and used to decide what day "today" is (see @/lib/today).
    // Validated as a real zone, not merely non-empty: a typo used to surface
    // only at the Google API boundary, but now it would reach every page that
    // asks for today's date.
    APP_TIMEZONE: z
      .string()
      .min(1)
      .refine(isValidTimeZone, {
        error: "APP_TIMEZONE must be a valid IANA timezone name, e.g. Europe/Madrid",
      })
      .default("Europe/Madrid"),
    // Shared secret for the optional POST /api/cron/calendar-sync sweeper.
    // Unset disables that route entirely (404).
    CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
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
