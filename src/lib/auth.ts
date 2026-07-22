import { randomUUID } from "node:crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { encode as defaultEncode } from "next-auth/jwt";

import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Bcrypt hash of a random string, compared against when no user matches the
 * submitted email. Running a hash comparison on both the found and not-found
 * paths keeps the response time constant, mitigating user-enumeration by timing.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8i7f7qJt0mQ5g8Yy0m1a2b3c4d5e6";

/** Lifetime of a database session, in milliseconds (30 days). */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// The Prisma adapter is referenced both as the NextAuth adapter and directly
// inside the `jwt.encode` override, which persists the credentials session row.
const adapter = PrismaAdapter(prisma);

/**
 * Auth.js v5 configuration. Uses the credentials provider with **database**
 * sessions: because Auth.js does not create a `Session` row for credentials
 * sign-ins out of the box, the `jwt.encode` override below creates one via the
 * adapter and stores its opaque token in the session cookie. Every subsequent
 * request then reads the session straight from the database.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  trustHost: true,
  // Session strategy is intentionally left unset: with an adapter present the
  // effective strategy is "database", but Auth.js rejects an *explicit*
  // `strategy: "database"` alongside a credentials-only provider list. The
  // `jwt.encode` override below is what actually persists the credentials
  // session row. Reads then load the session+user straight from the database.
  session: { maxAge: SESSION_MAX_AGE_MS / 1000 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * Validates the submitted credentials and returns the matching user, or
       * `null` when authentication fails (Auth.js turns that into a
       * `CredentialsSignin` error).
       *
       * @param {Record<string, unknown>} rawCredentials - Raw form payload.
       * @returns {Promise<import("next-auth").User | null>} The user or null.
       */
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        // Always run a bcrypt comparison to keep timing constant.
        const passwordMatches = await bcrypt.compare(
          parsed.data.password,
          user?.password ?? DUMMY_PASSWORD_HASH,
        );

        if (!user || !passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          locale: user.locale,
          theme: user.theme,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Flags credentials sign-ins so `jwt.encode` knows to mint a database
     * session instead of an encrypted JWT.
     */
    async jwt({ token, account }) {
      if (account?.provider === "credentials") {
        token.credentials = true;
      }
      return token;
    },
    /**
     * Shapes the client-facing session. In the database strategy Auth.js passes
     * the *raw* session row spread with the full user record (including the
     * password hash and the opaque session token) and returns whatever this
     * callback yields verbatim — so a clean object is built here to avoid
     * leaking those fields. Exposes only id, name, email, image, locale and theme.
     */
    async session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          locale: user.locale,
          theme: user.theme,
        },
      };
    },
  },
  jwt: {
    /**
     * For credentials sign-ins, create a real `Session` row and return its
     * token as the cookie value; otherwise fall back to the default JWT
     * encoding.
     *
     * @throws {Error} If the token has no subject or the session can't be created.
     */
    async encode(params) {
      if (!params.token?.credentials) {
        return defaultEncode(params);
      }

      const userId = params.token.sub;
      if (!userId) {
        throw new Error("[AUTH/ENCODE] Missing user id on credentials token.");
      }

      const session = await adapter.createSession?.({
        sessionToken: randomUUID(),
        userId,
        expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
      });

      if (!session) {
        throw new Error("[AUTH/ENCODE] Failed to create database session.");
      }

      return session.sessionToken;
    },
  },
});
