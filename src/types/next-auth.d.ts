import type { DefaultSession } from "next-auth";

import type { Locale, Theme } from "@/generated/prisma/enums";

// Module augmentation adding DMuster-specific fields to the Auth.js types.

declare module "next-auth" {
  /** Session exposes the user's id, locale and theme (CLAUDE.md §3). */
  interface Session {
    user: {
      id: string;
      locale: Locale;
      theme: Theme | null;
    } & DefaultSession["user"];
  }

  /** The object returned by `authorize` and stored by the adapter. */
  interface User {
    locale?: Locale;
    theme?: Theme | null;
  }
}

declare module "@auth/core/adapters" {
  /** The adapter-loaded user carries the persisted locale and theme. */
  interface AdapterUser {
    locale: Locale;
    theme: Theme | null;
  }
}

declare module "next-auth/jwt" {
  /** Marks a token minted from a credentials sign-in. */
  interface JWT {
    credentials?: boolean;
  }
}
