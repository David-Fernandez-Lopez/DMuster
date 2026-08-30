// The shape of the application's environment, declared apart from the module
// that reads it. `src/lib/env.ts` validates `process.env` the moment it is
// imported — deliberately, so a misconfigured deployment fails at startup
// rather than at the first request — which also means importing it is
// impossible anywhere `process.env` is not already complete, a test run
// included. Keeping the schema here lets it be exercised directly.
//
// Same split, and same reason, as `prisma/seedEnv.ts`.

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

/**
 * Minimum length for a shared secret, in characters.
 *
 * Matches what `openssl rand -base64 32` produces at its shortest and what the
 * Auth.js docs ask for. The schema previously accepted `min(1)`, which is to
 * say it accepted anything — including, verbatim, the `change_me_secret`
 * placeholder that `.env.example` ships and that this repository publishes.
 * A validator that admits a value written down in the same project is not
 * checking anything.
 *
 * Length is the whole check here, deliberately: every placeholder the project
 * ships is shorter than this, so a separate list of forbidden strings would
 * add nothing. (`prisma/seedEnv.ts` does keep such a list, because there the
 * placeholder is longer than the minimum.)
 */
const SECRET_MIN_LENGTH = 32;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.url(),
    AUTH_SECRET: z.string().min(SECRET_MIN_LENGTH, {
      error: `AUTH_SECRET must be at least ${SECRET_MIN_LENGTH} characters — generate one with \`openssl rand -base64 32\``,
    }),
    // Constrained to http or https — which is not the same as requiring https,
    // and deliberately so. This deployment is served over plain HTTP on a home
    // network; demanding a scheme it cannot provide would stop the app booting
    // to enforce a property nothing here can hold. The day TLS exists, the
    // change to make is Auth.js's `useSecureCookies`, not a rule in this line.
    //
    // The protocol check is here because `z.url()` alone lets a missing scheme
    // through: the WHATWG parser reads `localhost:3000` as scheme `localhost:`
    // with path `3000`, which is a valid URL and a useless `AUTH_URL`.
    AUTH_URL: z
      .url()
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        error: "AUTH_URL must start with http:// or https://",
      })
      .optional(),
    DEFAULT_LOCALE: z.enum(["es", "en"]).default("es"),
    // Google Calendar sync (roadmap #23) — optional. Unset means the app boots
    // normally and the profile hides the integration entirely; see
    // `isGoogleSyncConfigured` in env.ts.
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
    // Shared secret for the optional POST /api/cron/* sweepers. Unset disables
    // those routes entirely (404) — which stays a legitimate configuration, so
    // this is optional. What is not legitimate is a short one: the routes are
    // reachable by anyone who can address the app, and the only thing between
    // them and a sweep is this string.
    CRON_SECRET: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .min(SECRET_MIN_LENGTH, {
          error: `CRON_SECRET must be at least ${SECRET_MIN_LENGTH} characters — generate one with \`openssl rand -base64 32\``,
        })
        .optional(),
    ),
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
