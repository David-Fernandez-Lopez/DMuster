// Disables or re-enables an account, and ends its sessions.
//
// This is the operator half of account revocation. The application can end a
// person's own sessions and change their own password, but taking access away
// from someone else is not a thing it can offer: roles are per campaign and
// there is no global administrator to hold such a power.
//
// It works by setting `User.disabledAt` rather than deleting the row, because
// deleting is not available: six foreign keys reference a user with `Restrict`
// (campaigns and holidays created, sessions confirmed and cancelled,
// invitations sent and accepted), so anyone who has used the app cannot be
// deleted at all. Deleting would also cascade away their `Account` row —
// leaving the Google token alive on Google's side with nothing left pointing at
// it — and their `CalendarEventLog`, which is exactly the history worth keeping
// when an account is suspect.
//
// Runs inside the `app` container, because the database has no published port:
//
//   docker compose exec app npx tsx scripts/ops/disableAccount.ts
//   docker compose exec app npx tsx scripts/ops/disableAccount.ts --email=a@b --apply
//   docker compose exec app npx tsx scripts/ops/disableAccount.ts --email=a@b --enable --apply
//
// Flags:
//   --email=<address>   the account to act on (required to change anything)
//   --enable            restore access instead of revoking it
//   --apply             actually write (without it the script only reports)
//
// Disabling does NOT revoke the person's Google Calendar token. If that matters,
// have them disconnect from /profile first, or revoke it in their Google
// account settings — DMuster cannot do it on their behalf.
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

interface Options {
  email: string | null;
  enable: boolean;
  apply: boolean;
}

/**
 * Parses the command-line flags, defaulting to a read-only report so an
 * accidental invocation never changes anyone's access.
 *
 * @param {string[]} argv - Raw arguments, excluding node and the script path.
 * @returns {Options} The resolved options.
 */
function parseOptions(argv: string[]): Options {
  const emailArg = argv.find((arg) => arg.startsWith("--email="));

  return {
    email: emailArg ? emailArg.slice("--email=".length).trim().toLowerCase() : null,
    enable: argv.includes("--enable"),
    apply: argv.includes("--apply"),
  };
}

/**
 * Builds the MariaDB driver adapter from the DATABASE_URL connection string.
 * Mirrors the adapter used by the application (src/lib/prisma.ts).
 *
 * @param {string} databaseUrl - MySQL connection string.
 * @returns {PrismaMariaDb} Driver adapter ready to be passed to PrismaClient.
 */
function createAdapter(databaseUrl: string): PrismaMariaDb {
  const url = new URL(databaseUrl);

  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    allowPublicKeyRetrieval: true,
    connectionLimit: 5,
  });
}

/**
 * Reports the current state of every account, then disables or re-enables the
 * named one and ends its sessions.
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("[OPS/DISABLE] DATABASE_URL is not set.");
  }

  const prisma = new PrismaClient({ adapter: createAdapter(databaseUrl) });

  try {
    if (!options.email) {
      const users = await prisma.user.findMany({
        select: {
          email: true,
          disabledAt: true,
          _count: { select: { sessions: true } },
        },
        orderBy: { email: "asc" },
      });

      console.log("[OPS/DISABLE] Accounts:\n");
      for (const user of users) {
        const state = user.disabledAt
          ? `DISABLED since ${user.disabledAt.toISOString()}`
          : "active";
        console.log(`  ${user.email.padEnd(28)} ${state.padEnd(46)} ${user._count.sessions} session(s)`);
      }
      console.log("\n[OPS/DISABLE] Pass --email=<address> to act on one.");
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: options.email },
      select: { id: true, name: true, disabledAt: true },
    });
    if (!user) {
      console.error(`[OPS/DISABLE] No account with email ${options.email}.`);
      process.exitCode = 1;
      return;
    }

    const verb = options.enable ? "Enabling" : "Disabling";
    const already = options.enable ? !user.disabledAt : Boolean(user.disabledAt);
    if (already) {
      console.log(
        `[OPS/DISABLE] ${options.email} is already ${options.enable ? "active" : "disabled"}. Nothing to do.`,
      );
      return;
    }

    if (!options.apply) {
      console.log(`[OPS/DISABLE] Dry run. ${verb} ${options.email} (${user.name}).`);
      console.log("[OPS/DISABLE] Re-run with --apply to write.");
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { disabledAt: options.enable ? null : new Date() },
    });

    // Disabling only stops new sign-ins; a session already open keeps working,
    // because it is resolved from its own row and never consults the user's
    // state. Ending them is what makes the revocation take effect now.
    const ended = options.enable
      ? { count: 0 }
      : await prisma.session.deleteMany({ where: { userId: user.id } });

    console.log(
      options.enable
        ? `[OPS/DISABLE] ${options.email} can sign in again.`
        : `[OPS/DISABLE] ${options.email} disabled, ${ended.count} session(s) ended.`,
    );

    if (!options.enable) {
      console.log(
        "[OPS/DISABLE] Their Google Calendar token, if any, is untouched — DMuster " +
          "cannot revoke it on their behalf.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[OPS/DISABLE] Failed:", error);
  process.exitCode = 1;
});
