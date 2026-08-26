// Assigns a fresh, randomly generated password to each account, hashed with a
// distinct bcrypt salt per user.
//
// The application offers no way to change a password (there is no such screen
// and no such route), so this script is the only remedy available today for
// the accounts created by the seed: they all share a single bcrypt hash,
// which means guessing one password unlocks every one of them.
//
// It runs inside the `app` container, because the database has no published
// port and `db` only resolves on the compose network:
//
//   docker compose exec app npx tsx scripts/ops/rotatePasswords.ts
//   docker compose exec app npx tsx scripts/ops/rotatePasswords.ts --apply
//
// Flags:
//   --apply              actually write (without it the script only reports)
//   --emails=a@b,c@d     restrict to these accounts (default: all)
//   --end-sessions       also delete the affected users' session rows
//
// ⚠ --end-sessions signs those users out everywhere. It requires the /login
//   redirect fix to be deployed first, or they are bounced between "/" and
//   "/login" with no way back in.
import "dotenv/config";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

/** Bcrypt cost factor. Kept in sync with the app (src/lib/userService.ts). */
const BCRYPT_COST = 10;

/** Raw bytes per generated password: 12 bytes ≈ 96 bits, 16 base64url chars. */
const PASSWORD_BYTES = 12;

interface Options {
  apply: boolean;
  emails: string[] | null;
  endSessions: boolean;
}

/**
 * Parses the command-line flags this script accepts, defaulting to a dry run
 * so an accidental invocation never rewrites credentials.
 *
 * @param {string[]} argv - Raw arguments, excluding node and the script path.
 * @returns {Options} The resolved options.
 */
function parseOptions(argv: string[]): Options {
  const emailsArg = argv.find((arg) => arg.startsWith("--emails="));

  return {
    apply: argv.includes("--apply"),
    emails: emailsArg
      ? emailsArg
          .slice("--emails=".length)
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0)
      : null,
    endSessions: argv.includes("--end-sessions"),
  };
}

/**
 * Generates a random password. base64url keeps it copy-pasteable into any
 * client without escaping surprises, at 16 characters for 96 bits of entropy.
 *
 * @returns {string} A freshly generated password.
 */
function generatePassword(): string {
  return randomBytes(PASSWORD_BYTES).toString("base64url");
}

/**
 * Builds the MariaDB driver adapter from the DATABASE_URL connection string.
 * Mirrors the adapter used by the application (src/lib/prisma.ts) and the seed
 * script, including `allowPublicKeyRetrieval`, which the MySQL 8 default auth
 * plugin needs when connecting without TLS.
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
 * Counts how many distinct password hashes the given accounts hold. One
 * distinct hash across several accounts means they share a password — the
 * exact condition this script exists to undo, and the way to verify it worked.
 *
 * @param {{ password: string | null }[]} users - The accounts to inspect.
 * @returns {number} Number of distinct non-null hashes.
 */
function countDistinctHashes(users: { password: string | null }[]): number {
  return new Set(users.map((user) => user.password).filter((hash) => hash !== null)).size;
}

/**
 * Rotates the passwords: reports the current sharing situation, then (only
 * with --apply) writes a distinct hash per account and prints the new
 * credentials once, for the operator to distribute out of band.
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("[OPS/PASSWORDS] DATABASE_URL is not set.");
  }

  const prisma = new PrismaClient({ adapter: createAdapter(databaseUrl) });

  try {
    const users = await prisma.user.findMany({
      where: options.emails ? { email: { in: options.emails } } : undefined,
      select: { id: true, email: true, name: true, password: true },
      orderBy: { email: "asc" },
    });

    if (users.length === 0) {
      console.log("[OPS/PASSWORDS] No accounts matched. Nothing to do.");
      return;
    }

    const distinctBefore = countDistinctHashes(users);
    console.log(
      `[OPS/PASSWORDS] ${users.length} account(s), ${distinctBefore} distinct password hash(es).`
    );
    if (distinctBefore < users.length) {
      console.log(
        `[OPS/PASSWORDS] ⚠ ${users.length - distinctBefore} account(s) share a password with another account.`
      );
    }

    if (!options.apply) {
      console.log("\n[OPS/PASSWORDS] Dry run. Re-run with --apply to rotate:");
      for (const user of users) {
        console.log(`  ${user.email}  (${user.name})`);
      }
      return;
    }

    const issued: { email: string; password: string }[] = [];

    for (const user of users) {
      const password = generatePassword();
      // Hashed one at a time so every account gets its own salt, which is what
      // makes the resulting hashes distinct even if two passwords collided.
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

      await prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      });

      issued.push({ email: user.email, password });
    }

    if (options.endSessions) {
      const deleted = await prisma.session.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      });
      console.log(`[OPS/PASSWORDS] Deleted ${deleted.count} session row(s).`);
    }

    const after = await prisma.user.findMany({
      where: { id: { in: users.map((user) => user.id) } },
      select: { password: true },
    });
    console.log(
      `[OPS/PASSWORDS] Rotated ${issued.length} account(s), ` +
        `${countDistinctHashes(after)} distinct password hash(es) now.`
    );

    console.log("\n[OPS/PASSWORDS] New credentials — shown once, distribute out of band:\n");
    for (const entry of issued) {
      console.log(`  ${entry.email.padEnd(24)} ${entry.password}`);
    }
    console.log("\n[OPS/PASSWORDS] Clear this terminal's scrollback when you are done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[OPS/PASSWORDS] Rotation failed:", error);
  process.exitCode = 1;
});
