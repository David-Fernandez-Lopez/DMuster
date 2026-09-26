// Bootstraps an empty database with a single account and a single campaign in
// which that account is DM.
//
// There is no public sign-up: accounts are created by accepting an invitation,
// and only a DM can send one. This seed creates that first DM, who then invites
// everybody else from /profile. Every value it writes (email, name, password,
// campaign name and tag) comes from the environment — see prisma/seedEnv.ts —
// so the repository holds no one's personal data.
//
// It runs only against an EMPTY database (see `isEmpty()`), and has no override:
// on a populated one there is nothing to bootstrap.
import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { loadSeedEnv } from "./seedEnv";
import { PrismaClient, CampaignRole } from "../src/generated/prisma/client";

/** Bcrypt cost factor. Kept in sync with the app (src/lib/userService.ts). */
const BCRYPT_COST = 10;

/**
 * Builds the MariaDB driver adapter from the DATABASE_URL connection string.
 * Parsed into an explicit pool config because the MySQL 8 default auth plugin
 * (caching_sha2_password) requires `allowPublicKeyRetrieval` when connecting
 * without TLS, an option the Prisma URL format cannot express.
 *
 * @param {string} databaseUrl - MySQL connection string (mysql://user:pass@host:port/db).
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
 * Reports whether the database is still empty, logging what it holds when it
 * is not. Users and campaigns are what the seed writes, so either one existing
 * means the deployment has already been bootstrapped.
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @returns {Promise<boolean>} True when there are no users and no campaigns.
 */
async function isEmpty(prisma: PrismaClient): Promise<boolean> {
  const [users, campaigns] = await Promise.all([
    prisma.user.count(),
    prisma.campaign.count(),
  ]);

  if (users === 0 && campaigns === 0) {
    return true;
  }

  console.error(
    `[SEED] Refusing to run: the database is not empty (${users} users, ${campaigns} campaigns).\n` +
      `[SEED] The seed only bootstraps a fresh deployment. Invite new users from /profile instead.`
  );
  return false;
}

/**
 * Seed entry point: validates the environment, refuses to run against a
 * populated database, then creates the bootstrap user and their campaign (with
 * the user as its DM) in one transaction, so a failure leaves nothing behind.
 *
 * @throws {Error} If the environment is invalid or the database is not empty.
 */
async function main(): Promise<void> {
  const env = loadSeedEnv();

  const prisma = new PrismaClient({ adapter: createAdapter(env.DATABASE_URL) });

  try {
    // Thrown rather than returned quietly: a deploy script chaining this after
    // `migrate deploy` must stop and be looked at, not carry on as if the seed
    // had run.
    if (!(await isEmpty(prisma))) {
      throw new Error("Database is not empty. See the log above.");
    }

    console.log("[SEED] Creating the bootstrap account and campaign...");
    const passwordHash = await bcrypt.hash(env.SEED_USER_PASSWORD, BCRYPT_COST);

    const campaign = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: env.SEED_USER_NAME,
          email: env.SEED_USER_EMAIL,
          password: passwordHash,
        },
      });

      return tx.campaign.create({
        data: {
          name: env.SEED_CAMPAIGN_NAME,
          tag: env.SEED_CAMPAIGN_TAG,
          createdById: user.id,
          players: { create: { userId: user.id, role: CampaignRole.DM } },
        },
      });
    });

    console.log(
      `[SEED] Done: user "${env.SEED_USER_NAME}" is DM of "${campaign.name}" (${campaign.tag}). ` +
        `Sign in with SEED_USER_EMAIL and invite the rest of the group from /profile.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[SEED] Seeding failed:", error);
  process.exitCode = 1;
});
