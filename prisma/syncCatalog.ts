// Loads the role-system catalogues (prisma/catalog/*.json) into the database:
// the systems and the closed lists of skills and conditions each one offers the
// critical/fumble log.
//
// Idempotent and safe to run on every deploy (docker/migrate/entrypoint.sh does):
// it only writes the difference, and anything that disappears from the files is
// deactivated, never deleted, because events and campaigns may still use it.
// Files whose name starts with "_" (the template) are ignored.
//
//   npm run catalog:sync                       # apply
//   npm run catalog:sync -- --dry-run          # only report
import "dotenv/config";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import { type CatalogFile, catalogFileSchema, planCatalogSync } from "../src/lib/systemCatalog";

const CATALOG_DIR = join(__dirname, "catalog");

/**
 * Builds the MariaDB driver adapter from the DATABASE_URL connection string.
 * Mirrors the one in prisma/seed.ts.
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
 * Reads and validates every catalogue file, failing with the file name and the
 * reason so a typo in a JSON stops the deploy loudly instead of half-loading.
 *
 * @returns {CatalogFile[]} The validated files, in name order.
 * @throws {Error} When a file is not valid JSON or does not match the schema.
 */
function readCatalogFiles(): CatalogFile[] {
  const names = readdirSync(CATALOG_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .sort();

  const files = names.map((name) => {
    try {
      return catalogFileSchema.parse(JSON.parse(readFileSync(join(CATALOG_DIR, name), "utf8")));
    } catch (error) {
      throw new Error(`Invalid catalogue file ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const keys = files.map((file) => file.key);
  const repeated = keys.find((key, index) => keys.indexOf(key) !== index);
  if (repeated) {
    throw new Error(`Two catalogue files declare the system "${repeated}".`);
  }
  return files;
}

/**
 * Plans the sync against the database and, unless `--dry-run`, writes it in one
 * transaction.
 *
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const files = readCatalogFiles();
  const prisma = new PrismaClient({ adapter: createAdapter(databaseUrl) });

  try {
    const [systems, skills] = await Promise.all([
      prisma.roleSystem.findMany({ select: { key: true, name: true, active: true } }),
      prisma.systemSkill.findMany({
        select: {
          key: true,
          category: true,
          nameEs: true,
          nameEn: true,
          allowsDetail: true,
          requiresDetail: true,
          sortOrder: true,
          active: true,
          system: { select: { key: true } },
        },
      }),
    ]);

    const plan = planCatalogSync(files, {
      systems,
      skills: skills.map(({ system, ...skill }) => ({ systemKey: system.key, ...skill })),
    });

    console.log(
      `[CATALOG] ${files.length} file(s): ${plan.systemsToUpsert.length} system(s) to write, ` +
        `${plan.skillsToUpsert.length} skill(s) to write, ` +
        `${plan.systemsToDeactivate.length} system(s) and ${plan.skillsToDeactivate.length} skill(s) to deactivate.`,
    );
    if (files.length === 0) {
      console.log("[CATALOG] No catalogue files found: nothing is deactivated.");
    }
    if (dryRun) {
      console.log("[CATALOG] Dry run: nothing was written.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const system of plan.systemsToUpsert) {
        await tx.roleSystem.upsert({
          where: { key: system.key },
          create: { key: system.key, name: system.name, active: true },
          update: { name: system.name, active: true },
        });
      }

      const ids = new Map((await tx.roleSystem.findMany({ select: { id: true, key: true } })).map((s) => [s.key, s.id]));

      for (const skill of plan.skillsToUpsert) {
        const systemId = ids.get(skill.systemKey);
        if (!systemId) {
          throw new Error(`System "${skill.systemKey}" is missing after the upsert.`);
        }
        const data = {
          key: skill.key,
          category: skill.category,
          nameEs: skill.nameEs,
          nameEn: skill.nameEn,
          allowsDetail: skill.allowsDetail,
          requiresDetail: skill.requiresDetail,
          sortOrder: skill.sortOrder,
        };
        await tx.systemSkill.upsert({
          where: { systemId_key: { systemId, key: skill.key } },
          create: { systemId, ...data, active: true },
          update: { ...data, active: true },
        });
      }

      for (const { systemKey, key } of plan.skillsToDeactivate) {
        await tx.systemSkill.updateMany({
          where: { key, system: { key: systemKey } },
          data: { active: false },
        });
      }
      for (const key of plan.systemsToDeactivate) {
        await tx.roleSystem.update({ where: { key }, data: { active: false } });
      }
    });

    console.log("[CATALOG] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[CATALOG] Sync failed:", error);
  process.exitCode = 1;
});
