import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.url(),
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.url().optional(),
    DEFAULT_LOCALE: z.enum(["es", "en"]).default("es"),
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
