// Imports the critical/fumble history from the Excel export (a JSON file) into
// the app's log (`dice_events`).
//
// The Excel names campaigns and players its own way, and some of them do not
// exist in the app (a one-shot campaign, a former player, someone who is not in
// that campaign). The script never guesses: every name has to be listed in a
// mapping file, and anything unmapped is reported and blocks `--apply`.
//
// Runs inside the `app` container, because the database has no published port.
// Copy the two files in first (they hold real names, so they are not in the
// image and the mapping is git-ignored):
//
//   docker compose cp history.json app:/tmp/history.json
//   docker compose cp dice-events.mapping.json app:/tmp/dice-events.mapping.json
//   docker compose exec app npx tsx scripts/ops/importDiceEvents.ts \
//     --file=/tmp/history.json --mapping=/tmp/dice-events.mapping.json            # report
//   docker compose exec app npx tsx scripts/ops/importDiceEvents.ts \
//     --file=/tmp/history.json --mapping=/tmp/dice-events.mapping.json --apply    # write
//
// Flags:
//   --file=<path>      the Excel export (required)
//   --mapping=<path>   the mapping, see scripts/ops/diceEvents.mapping.example.json (required)
//   --apply            actually write (without it the script only reports)
//
// Re-running is safe: every row carries a key built from the Excel cell
// (`excel:<player>:<campaign>:<cell>`) and rows already stored are left alone.
// Missing arcs ("arco" in the Excel) are created, unnamed, in the campaign.
// Exit code 1 when there are blocking issues, so a script or a person can tell.
import "dotenv/config";

import { readFileSync } from "node:fs";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";
import { toUtcDate } from "../../src/lib/date";
import {
  excelHistorySchema,
  formatImportReport,
  importMappingSchema,
  planDiceEventImport,
  type ImportWorld,
} from "../../src/lib/diceEventImport";
import { todayIso } from "../../src/lib/today";

interface Options {
  file: string | null;
  mapping: string | null;
  apply: boolean;
}

/**
 * Parses the command-line flags, defaulting to a read-only report.
 *
 * @param {string[]} argv - Raw arguments, excluding node and the script path.
 * @returns {Options} The resolved options.
 */
function parseOptions(argv: string[]): Options {
  const value = (name: string) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3).trim() : null;
  };
  return { file: value("file"), mapping: value("mapping"), apply: argv.includes("--apply") };
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
 * Reads and parses a JSON file, failing with the path and the cause.
 *
 * @param {string} path - File to read.
 * @returns {unknown} The parsed JSON.
 * @throws {Error} When the file cannot be read or is not JSON.
 */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads what the plan needs to know about the app: campaigns, users,
 * memberships, existing arcs and keys already imported.
 *
 * @param {PrismaClient} prisma - Connected Prisma client.
 * @returns {Promise<ImportWorld>} The app's current state.
 */
async function loadWorld(prisma: PrismaClient): Promise<ImportWorld> {
  const [campaigns, users, memberships, arcs, keys] = await Promise.all([
    prisma.campaign.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.campaignPlayer.findMany({ select: { campaignId: true, userId: true } }),
    prisma.campaignArc.findMany({ select: { campaignId: true, number: true } }),
    prisma.diceEvent.findMany({ where: { importKey: { not: null } }, select: { importKey: true } }),
  ]);

  const arcNumbers = new Map<string, Set<number>>();
  for (const arc of arcs) {
    const set = arcNumbers.get(arc.campaignId) ?? new Set<number>();
    set.add(arc.number);
    arcNumbers.set(arc.campaignId, set);
  }

  return {
    campaigns,
    users,
    memberships: new Set(memberships.map((m) => `${m.campaignId}:${m.userId}`)),
    arcNumbers,
    existingKeys: new Set(keys.flatMap((k) => (k.importKey ? [k.importKey] : []))),
    today: todayIso(),
  };
}

/**
 * Plans the import, prints the report and, with `--apply` and no blocking
 * issue, writes the arcs and rows in one transaction.
 *
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options.file || !options.mapping) {
    console.error("Usage: importDiceEvents.ts --file=<history.json> --mapping=<mapping.json> [--apply]");
    process.exitCode = 1;
    return;
  }

  const history = excelHistorySchema.parse(readJson(options.file));
  const mapping = importMappingSchema.parse(readJson(options.mapping));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  const prisma = new PrismaClient({ adapter: createAdapter(databaseUrl) });

  try {
    const world = await loadWorld(prisma);
    const plan = planDiceEventImport(history, mapping, world);
    console.log(formatImportReport(plan, world));

    if (plan.issues.some((issue) => issue.blocking)) {
      console.log("\nBlocking issues found: nothing was written. Fix the mapping (or the app) and run again.");
      process.exitCode = 1;
      return;
    }
    if (!options.apply) {
      console.log("\nDry run: nothing was written. Add --apply to write.");
      return;
    }
    if (plan.rows.length === 0 && plan.arcsToCreate.length === 0) {
      console.log("\nNothing to write.");
      return;
    }

    const importer = world.users.find(
      (u) =>
        u.email.toLowerCase() === mapping.importedBy.trim().toLowerCase() ||
        u.name.trim().toLowerCase() === mapping.importedBy.trim().toLowerCase(),
    );
    if (!importer) {
      throw new Error("importedBy no longer resolves to a user.");
    }

    const written = await prisma.$transaction(async (tx) => {
      if (plan.arcsToCreate.length > 0) {
        await tx.campaignArc.createMany({ data: plan.arcsToCreate, skipDuplicates: true });
      }
      const arcs = await tx.campaignArc.findMany({
        where: { campaignId: { in: [...new Set(plan.rows.map((r) => r.campaignId))] } },
        select: { id: true, campaignId: true, number: true },
      });
      const arcId = (campaignId: string, number: number | null) =>
        number === null
          ? null
          : (arcs.find((a) => a.campaignId === campaignId && a.number === number)?.id ?? null);

      const result = await tx.diceEvent.createMany({
        data: plan.rows.map((row) => ({
          campaignId: row.campaignId,
          userId: row.userId,
          kind: row.kind,
          skill: row.skill,
          date: toUtcDate(row.date),
          time: row.time,
          arcId: arcId(row.campaignId, row.arcNumber),
          createdById: importer.id,
          importKey: row.importKey,
        })),
        skipDuplicates: true,
      });
      return result.count;
    });

    console.log(`\nWritten: ${written} entries, ${plan.arcsToCreate.length} arcs created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[IMPORT/DICE_EVENTS] Import failed:", error);
  process.exitCode = 1;
});
