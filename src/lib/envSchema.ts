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
 * shows for every optional var) is parsed as `""`, not
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
    // Wall-clock timezone the application lives in (IANA name). Stored session
    // times are timezone-less "HH:MM" strings; the calendar feed converts them
    // to UTC with this zone (DST included), and it decides what day "today" is
    // (see @/lib/today). Validated as a real zone, not merely non-empty: a typo
    // would otherwise reach every page that asks for today's date.
    APP_TIMEZONE: z
      .string()
      .min(1)
      .refine(isValidTimeZone, {
        error: "APP_TIMEZONE must be a valid IANA timezone name, e.g. Europe/Madrid",
      })
      .default("Europe/Madrid"),
    // Outgoing mail (password recovery). All-or-nothing: unset leaves the
    // feature disabled, a partial set is refused below. Credentials are
    // optional because some relays accept unauthenticated local connections.
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional()),
    // true = implicit TLS (port 465); false = STARTTLS when offered (587).
    SMTP_SECURE: z.preprocess(
      emptyToUndefined,
      z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    ),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    // Sender shown to the recipient, e.g. `DMuster <no-reply@example.com>`.
    SMTP_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.SMTP_HOST) !== Boolean(value.SMTP_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST and SMTP_FROM must be set together",
      });
    }
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "SMTP_USER and SMTP_PASSWORD must be set together",
      });
    }
    // A port/TLS mismatch only fails at the first send, long after startup:
    // 465 speaks TLS from the first byte, 587/25 start in plain text.
    if (value.SMTP_PORT === 465 && value.SMTP_SECURE !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_SECURE"],
        message: "SMTP_PORT 465 requires SMTP_SECURE=true",
      });
    }
    if (value.SMTP_SECURE === true && (value.SMTP_PORT === 587 || value.SMTP_PORT === 25)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_SECURE"],
        message: "SMTP_SECURE=true does not work with port 587 or 25; use false (STARTTLS)",
      });
    }
    if (value.NODE_ENV === "production" && !value.AUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_URL"],
        message: "AUTH_URL is required in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
