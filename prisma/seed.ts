// Seeds the database with the reference group data from CLAUDE.md §7:
// 9 users, 9 campaigns and their memberships (with per-campaign DM roles).
// Idempotent: running it multiple times produces no errors or duplicates.
import "dotenv/config";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient, CampaignRole } from "../src/generated/prisma/client";

const EMAIL_DOMAIN = "dmuster.local";
const BCRYPT_COST = 10;

const PLAYER_NICKS = [
  "cgoob",
  "sergio",
  "salgado",
  "paola",
  "tucho",
  "david",
  "adri",
  "patri",
  "ana",
] as const;

type Nick = (typeof PLAYER_NICKS)[number];

interface CampaignSeed {
  name: string;
  /** Members holding the DM role in this campaign (a campaign may have several). */
  dms: Nick[];
  /** Recorded as `Campaign.createdById` (audit only — permissions come from the DM role). */
  createdBy: Nick;
}

const CAMPAIGNS: CampaignSeed[] = [
  { name: "academia", dms: ["adri"], createdBy: "adri" },
  { name: "orden", dms: ["salgado"], createdBy: "salgado" },
  { name: "cyberPunk", dms: ["sergio"], createdBy: "sergio" },
  { name: "poulard", dms: ["paola"], createdBy: "paola" },
  { name: "fishing", dms: ["cgoob"], createdBy: "cgoob" },
  { name: "starWars", dms: ["adri"], createdBy: "adri" },
  { name: "chicasMagicas", dms: ["cgoob", "paola", "adri"], createdBy: "cgoob" },
  { name: "vampiro", dms: ["sergio"], createdBy: "sergio" },
  { name: "verkko", dms: ["david"], createdBy: "david" },
];

/** Campaign membership per player, exactly as listed in CLAUDE.md §7. */
const MEMBERSHIPS: Record<Nick, string[]> = {
  cgoob: ["academia", "orden", "cyberPunk", "poulard", "fishing", "starWars", "chicasMagicas", "verkko"],
  sergio: ["academia", "orden", "cyberPunk", "vampiro", "verkko"],
  salgado: ["orden", "cyberPunk"],
  paola: ["academia", "orden", "cyberPunk", "poulard", "fishing", "starWars", "chicasMagicas", "vampiro", "verkko"],
  tucho: ["academia", "orden", "poulard", "fishing", "starWars", "chicasMagicas"],
  david: ["academia", "orden", "cyberPunk", "poulard", "fishing", "starWars", "chicasMagicas", "vampiro", "verkko"],
  adri: ["academia", "orden", "cyberPunk", "poulard", "fishing", "starWars", "chicasMagicas", "vampiro", "verkko"],
  patri: ["academia", "orden", "cyberPunk", "poulard", "starWars", "chicasMagicas", "vampiro", "verkko"],
  ana: ["poulard", "vampiro"],
};

const seedEnvSchema = z.object({
  DATABASE_URL: z.url(),
  SEED_DEFAULT_PASSWORD: z.string().min(1),
});

type SeedEnv = z.infer<typeof seedEnvSchema>;

/**
 * Validates the environment variables required by the seed script, failing
 * fast with a readable error when one is missing or malformed. Kept local to
 * this script (instead of src/lib/env.ts) because SEED_DEFAULT_PASSWORD is
 * only needed at seed time and must not be required at application runtime.
 *
 * @returns {SeedEnv} The validated seed environment.
 * @throws {Error} If a required environment variable is invalid.
 */
function loadSeedEnv(): SeedEnv {
  const result = seedEnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      `[SEED/ENV] Invalid environment variables:\n${z.prettifyError(result.error)}`
    );
    throw new Error("Invalid seed environment variables. See logs for details.");
  }

  return result.data;
}

/**
 * Asserts that the static seed data is internally consistent: every DM and
 * every creator of a campaign must also appear in that campaign's membership
 * list. Guards against typos when the reference data is edited by hand.
 *
 * @throws {Error} If a campaign lists a DM or creator that is not a member.
 */
function assertSeedDataConsistency(): void {
  for (const campaign of CAMPAIGNS) {
    for (const nick of [...campaign.dms, campaign.createdBy]) {
      if (!MEMBERSHIPS[nick].includes(campaign.name)) {
        throw new Error(
          `[SEED/DATA] "${nick}" is DM/creator of "${campaign.name}" but is not listed as a member`
        );
      }
    }
  }
}

/**
 * Upserts the reference users keyed by their unique email
 * (`<nick>@dmuster.local`). Existing users are left untouched so re-running
 * the seed never overwrites passwords or locales changed from the app; only
 * missing users are created, with the bcrypt-hashed default password.
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @param {string} passwordHash - Bcrypt hash shared by all seeded users.
 * @returns {Promise<Map<Nick, string>>} Map of nick to user id.
 */
async function seedUsers(
  prisma: PrismaClient,
  passwordHash: string
): Promise<Map<Nick, string>> {
  const userIds = new Map<Nick, string>();

  for (const nick of PLAYER_NICKS) {
    const user = await prisma.user.upsert({
      where: { email: `${nick}@${EMAIL_DOMAIN}` },
      update: {},
      create: {
        name: nick,
        email: `${nick}@${EMAIL_DOMAIN}`,
        password: passwordHash,
      },
    });
    userIds.set(nick, user.id);
  }

  return userIds;
}

/**
 * Ensures every reference campaign exists. `Campaign.name` is intentionally
 * not unique at the schema level (future multi-group support), so idempotency
 * is achieved with findFirst-by-name plus create instead of a native upsert.
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @param {Map<Nick, string>} userIds - Map of nick to user id (for createdById).
 * @returns {Promise<Map<string, string>>} Map of campaign name to campaign id.
 */
async function seedCampaigns(
  prisma: PrismaClient,
  userIds: Map<Nick, string>
): Promise<Map<string, string>> {
  const campaignIds = new Map<string, string>();

  for (const campaignSeed of CAMPAIGNS) {
    let campaign = await prisma.campaign.findFirst({
      where: { name: campaignSeed.name },
    });

    if (!campaign) {
      campaign = await prisma.campaign.create({
        data: {
          name: campaignSeed.name,
          createdById: userIds.get(campaignSeed.createdBy)!,
        },
      });
    }

    campaignIds.set(campaignSeed.name, campaign.id);
  }

  return campaignIds;
}

/**
 * Upserts campaign memberships with their role: DM when the player is listed
 * as DM of that campaign, PLAYER otherwise. The role is rewritten on update
 * so corrections to the seed data propagate on re-runs.
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @param {Map<Nick, string>} userIds - Map of nick to user id.
 * @param {Map<string, string>} campaignIds - Map of campaign name to campaign id.
 */
async function seedMemberships(
  prisma: PrismaClient,
  userIds: Map<Nick, string>,
  campaignIds: Map<string, string>
): Promise<void> {
  const dmsByCampaign = new Map<string, Set<Nick>>(
    CAMPAIGNS.map((campaign) => [campaign.name, new Set(campaign.dms)])
  );

  for (const nick of PLAYER_NICKS) {
    for (const campaignName of MEMBERSHIPS[nick]) {
      const campaignId = campaignIds.get(campaignName)!;
      const userId = userIds.get(nick)!;
      const role = dmsByCampaign.get(campaignName)?.has(nick)
        ? CampaignRole.DM
        : CampaignRole.PLAYER;

      await prisma.campaignPlayer.upsert({
        where: { campaignId_userId: { campaignId, userId } },
        update: { role },
        create: { campaignId, userId, role },
      });
    }
  }
}

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
 * Seed entry point: validates the environment and static data, then seeds
 * users, campaigns and memberships, logging final row counts.
 */
async function main(): Promise<void> {
  const env = loadSeedEnv();
  assertSeedDataConsistency();

  const adapter = createAdapter(env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("[SEED] Seeding reference group data...");
    const passwordHash = await bcrypt.hash(env.SEED_DEFAULT_PASSWORD, BCRYPT_COST);

    const userIds = await seedUsers(prisma, passwordHash);
    const campaignIds = await seedCampaigns(prisma, userIds);
    await seedMemberships(prisma, userIds, campaignIds);

    const [users, campaigns, memberships, dmMemberships] = await Promise.all([
      prisma.user.count(),
      prisma.campaign.count(),
      prisma.campaignPlayer.count(),
      prisma.campaignPlayer.count({ where: { role: CampaignRole.DM } }),
    ]);

    console.log(
      `[SEED] Done: ${users} users, ${campaigns} campaigns, ` +
        `${memberships} memberships (${dmMemberships} DM, ${memberships - dmMemberships} PLAYER).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[SEED] Seeding failed:", error);
  process.exitCode = 1;
});
