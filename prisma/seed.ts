// Seeds the database with the reference group data from CLAUDE.md §7:
// 9 users, 9 campaigns (with 2-letter tags and per-campaign DM roles), their
// memberships, the extra weekday holidays, and the sample per-day availability.
// Idempotent: running it multiple times produces no errors or duplicates.
import "dotenv/config";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import {
  PrismaClient,
  CampaignRole,
  AvailabilityStatus,
} from "../src/generated/prisma/client";

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
  /** Two-letter chip label shown in the calendar UI (e.g. "AC"). */
  tag: string;
  /** Members holding the DM role in this campaign (a campaign may have several). */
  dms: Nick[];
  /** Recorded as `Campaign.createdById` (audit only — permissions come from the DM role). */
  createdBy: Nick;
}

const CAMPAIGNS: CampaignSeed[] = [
  { name: "academia", tag: "AC", dms: ["adri"], createdBy: "adri" },
  { name: "orden", tag: "OR", dms: ["salgado"], createdBy: "salgado" },
  { name: "cyberPunk", tag: "CP", dms: ["sergio"], createdBy: "sergio" },
  { name: "poulard", tag: "PO", dms: ["paola"], createdBy: "paola" },
  { name: "fishing", tag: "FI", dms: ["cgoob"], createdBy: "cgoob" },
  { name: "starWars", tag: "SW", dms: ["adri"], createdBy: "adri" },
  { name: "chicasMagicas", tag: "CM", dms: ["cgoob", "paola", "adri"], createdBy: "cgoob" },
  { name: "vampiro", tag: "VA", dms: ["sergio"], createdBy: "sergio" },
  { name: "verkko", tag: "VE", dms: ["david"], createdBy: "david" },
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

/**
 * Weekday dates that are eligible for play in addition to weekends (which are
 * always eligible and never stored). Managed at runtime via the Holiday table.
 */
const HOLIDAYS: string[] = ["2026-07-15", "2026-08-06"];

/** Player used as the audit creator of the seeded holidays (audit-only). */
const HOLIDAY_CREATED_BY: Nick = "david";

/**
 * Sample per-day availability, grouped by eligible day. Each player's response
 * is global (applies to all their campaigns) and only ever "S" (yes) or "N"
 * (no); a missing player on a date means "no response" and is derived as
 * pending, never stored. Grouping by date makes duplicate (date, player) pairs
 * impossible by construction. Ported from the design handoff seed (jul–aug 2026).
 */
const DAY_AVAILABILITY_SEED: Record<string, Partial<Record<Nick, "S" | "N">>> = {
  "2026-07-04": { sergio: "S", salgado: "S", paola: "S", tucho: "S", david: "S", adri: "S", ana: "S" },
  "2026-07-05": { cgoob: "N", sergio: "S", salgado: "S", tucho: "N", david: "S", adri: "S", ana: "S" },
  "2026-07-11": { sergio: "S", salgado: "N", paola: "S", tucho: "S", david: "S", adri: "S", patri: "S", ana: "S" },
  "2026-07-12": { cgoob: "S", sergio: "S", salgado: "S", paola: "S", david: "N", patri: "N" },
  "2026-07-15": { cgoob: "S", sergio: "S", salgado: "S", paola: "N", tucho: "S", david: "N", patri: "S", ana: "S" },
  "2026-07-18": { cgoob: "N", sergio: "S", salgado: "S", tucho: "S", david: "N", adri: "N", ana: "S" },
  "2026-07-19": { sergio: "N", salgado: "N", paola: "N", tucho: "S", david: "S", adri: "S" },
  "2026-07-25": { cgoob: "N", sergio: "S", salgado: "N", paola: "S", tucho: "S", david: "S", patri: "S", ana: "S" },
  "2026-07-26": { sergio: "S", salgado: "S", paola: "N", tucho: "S", david: "S", adri: "N", patri: "S", ana: "S" },
  "2026-08-01": { cgoob: "S", sergio: "S", salgado: "S", paola: "S", tucho: "S", david: "S", adri: "S", patri: "S", ana: "N" },
  "2026-08-02": { cgoob: "S", sergio: "S", salgado: "S", paola: "N", tucho: "S", david: "S", adri: "S", patri: "S", ana: "S" },
  "2026-08-06": { cgoob: "S", salgado: "S", tucho: "S", david: "S", adri: "S", patri: "S", ana: "N" },
  "2026-08-08": { cgoob: "S", sergio: "S", salgado: "S", paola: "S", tucho: "S", david: "S", adri: "S", patri: "S", ana: "S" },
  "2026-08-09": { cgoob: "S", sergio: "S", paola: "S", tucho: "S", david: "S", patri: "S" },
  "2026-08-15": { cgoob: "N", sergio: "S", salgado: "S", paola: "S", tucho: "S", david: "S", adri: "S", ana: "N" },
  "2026-08-16": { cgoob: "S", sergio: "S", salgado: "N", tucho: "S", david: "S", patri: "S", ana: "N" },
  "2026-08-22": { cgoob: "S", sergio: "S", salgado: "S", paola: "S", david: "S", patri: "S", ana: "N" },
  "2026-08-23": { cgoob: "S", sergio: "S", salgado: "S", tucho: "S", david: "S", adri: "S", patri: "S", ana: "S" },
  "2026-08-29": { cgoob: "N", sergio: "S", salgado: "S", paola: "S", tucho: "S", david: "N", adri: "S", patri: "S", ana: "N" },
  "2026-08-30": { cgoob: "S", sergio: "N", salgado: "S", paola: "N", david: "N", adri: "S", patri: "S", ana: "S" },
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
 * Parses a "YYYY-MM-DD" string into a Date pinned to UTC midnight, so values
 * stored in `@db.Date` columns land on the intended calendar day regardless of
 * the host timezone. The local `Date` constructor would shift the day (e.g. in
 * Madrid summer time it would store the previous day).
 *
 * @param {string} dateStr - ISO calendar date, "YYYY-MM-DD".
 * @returns {Date} The date at 00:00:00 UTC.
 */
function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Mirrors the app's day-eligibility rule to validate seed dates: a date is
 * eligible when it is a Saturday, a Sunday, or listed in HOLIDAYS.
 *
 * @param {string} dateStr - ISO calendar date, "YYYY-MM-DD".
 * @returns {boolean} True when the date is eligible for play.
 */
function isEligibleDate(dateStr: string): boolean {
  const day = toUtcDate(dateStr).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6 || HOLIDAYS.includes(dateStr);
}

/**
 * Asserts that the static seed data is internally consistent: every DM and
 * every creator of a campaign must be a member of it, every availability
 * response must reference a known player, and every availability date must be
 * eligible. Guards against typos when the reference data is edited by hand.
 *
 * @throws {Error} If any consistency invariant is violated.
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

  const knownNicks = new Set<string>(PLAYER_NICKS);
  for (const [dateStr, responses] of Object.entries(DAY_AVAILABILITY_SEED)) {
    if (!isEligibleDate(dateStr)) {
      throw new Error(
        `[SEED/DATA] availability date "${dateStr}" is not eligible (not a weekend or holiday)`
      );
    }
    for (const nick of Object.keys(responses)) {
      if (!knownNicks.has(nick)) {
        throw new Error(
          `[SEED/DATA] availability on "${dateStr}" references unknown player "${nick}"`
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
 * Ensures every reference campaign exists with its tag. `Campaign.name` is
 * intentionally not unique at the schema level (future multi-group support),
 * so idempotency is achieved with findFirst-by-name plus create instead of a
 * native upsert. The tag is rewritten on re-runs so seed corrections propagate.
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
    const existing = await prisma.campaign.findFirst({
      where: { name: campaignSeed.name },
    });

    const campaign = existing
      ? await prisma.campaign.update({
          where: { id: existing.id },
          data: { tag: campaignSeed.tag },
        })
      : await prisma.campaign.create({
          data: {
            name: campaignSeed.name,
            tag: campaignSeed.tag,
            createdById: userIds.get(campaignSeed.createdBy)!,
          },
        });

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
 * Upserts the extra weekday holidays keyed by their unique date. Weekends are
 * eligible automatically and are never stored here. The audit creator is a
 * fixed reference player (audit-only, has no bearing on permissions).
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @param {Map<Nick, string>} userIds - Map of nick to user id (for createdById).
 */
async function seedHolidays(
  prisma: PrismaClient,
  userIds: Map<Nick, string>
): Promise<void> {
  const createdById = userIds.get(HOLIDAY_CREATED_BY)!;

  for (const dateStr of HOLIDAYS) {
    const date = toUtcDate(dateStr);
    await prisma.holiday.upsert({
      where: { date },
      update: {},
      create: { date, createdById },
    });
  }
}

/**
 * Upserts the sample availability responses keyed by the unique (date, user)
 * pair, mapping "S" to YES and "N" to NO. Absent players on a date are left
 * without a row (derived as pending), matching the storage model.
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @param {Map<Nick, string>} userIds - Map of nick to user id.
 */
async function seedAvailability(
  prisma: PrismaClient,
  userIds: Map<Nick, string>
): Promise<void> {
  for (const [dateStr, responses] of Object.entries(DAY_AVAILABILITY_SEED)) {
    const date = toUtcDate(dateStr);

    for (const [nick, code] of Object.entries(responses)) {
      const userId = userIds.get(nick as Nick)!;
      const status =
        code === "S" ? AvailabilityStatus.YES : AvailabilityStatus.NO;

      await prisma.availability.upsert({
        where: { date_userId: { date, userId } },
        update: { status },
        create: { date, userId, status },
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
 * users, campaigns, memberships, holidays and availability, logging final
 * row counts.
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
    await seedHolidays(prisma, userIds);
    await seedAvailability(prisma, userIds);

    const [users, campaigns, memberships, dmMemberships, holidays, availabilities] =
      await Promise.all([
        prisma.user.count(),
        prisma.campaign.count(),
        prisma.campaignPlayer.count(),
        prisma.campaignPlayer.count({ where: { role: CampaignRole.DM } }),
        prisma.holiday.count(),
        prisma.availability.count(),
      ]);

    console.log(
      `[SEED] Done: ${users} users, ${campaigns} campaigns, ` +
        `${memberships} memberships (${dmMemberships} DM, ${memberships - dmMemberships} PLAYER), ` +
        `${holidays} holidays, ${availabilities} availabilities.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[SEED] Seeding failed:", error);
  process.exitCode = 1;
});
