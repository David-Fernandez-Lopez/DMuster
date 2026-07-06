import type { DefaultSession } from "next-auth";

import type { Locale } from "@/generated/prisma/enums";

// Module augmentation adding DMuster-specific fields to the Auth.js types.

declare module "next-auth" {
  /** Session exposes the user's id and locale (CLAUDE.md §3). */
  interface Session {
    user: {
      id: string;
      locale: Locale;
    } & DefaultSession["user"];
  }

  /** The object returned by `authorize` and stored by the adapter. */
  interface User {
    locale?: Locale;
  }
}

declare module "@auth/core/adapters" {
  /** The adapter-loaded user carries the persisted locale. */
  interface AdapterUser {
    locale: Locale;
  }
}

declare module "next-auth/jwt" {
  /** Marks a token minted from a credentials sign-in. */
  interface JWT {
    credentials?: boolean;
  }
}
