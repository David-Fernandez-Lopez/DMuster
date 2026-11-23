import { z } from "zod";

/** Maximum length of a catalogue key and of a displayed name (matches the columns). */
const KEY_MAX_LENGTH = 40;
const NAME_MAX_LENGTH = 80;

/** One skill or condition of a system, as a catalogue file writes it. */
const catalogSkillSchema = z.object({
  /** Stable, language-neutral key: `PERCEPTION`, `DYING`. Never reused for something else. */
  key: z.string().regex(new RegExp(`^[A-Z0-9_]{1,${KEY_MAX_LENGTH}}$`), {
    error: "skill key must be 1-40 characters of A-Z, 0-9 and _",
  }),
  category: z.enum(["SKILL", "CONDITION"]),
  /** Name in Spanish. */
  es: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  /** Name in English. */
  en: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  /** True for open-ended entries (a Lore) that may carry a short detail. */
  allowsDetail: z.boolean().default(false),
});

/**
 * One system's catalogue file (`prisma/catalog/<system>.json`). The order of
 * `skills` is the order the form lists them in. Keys must be unique inside the
 * file.
 */
export const catalogFileSchema = z
  .object({
    key: z.string().regex(new RegExp(`^[a-z0-9-]{1,${KEY_MAX_LENGTH}}$`), {
      error: "system key must be 1-40 characters of a-z, 0-9 and -",
    }),
    name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    skills: z.array(catalogSkillSchema).default([]),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.skills.forEach((skill, index) => {
      if (seen.has(skill.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["skills", index, "key"],
          message: `duplicate skill key "${skill.key}" in "${file.key}"`,
        });
      }
      seen.add(skill.key);
    });
  });

export type CatalogFile = z.infer<typeof catalogFileSchema>;

/** What the database holds now, flattened for comparison. */
export type CatalogCurrent = {
  systems: { key: string; name: string; active: boolean }[];
  skills: {
    systemKey: string;
    key: string;
    category: "SKILL" | "CONDITION";
    nameEs: string;
    nameEn: string;
    allowsDetail: boolean;
    sortOrder: number;
    active: boolean;
  }[];
};

/** What a sync has to write. Empty lists everywhere mean "already in sync". */
export type CatalogSyncPlan = {
  systemsToUpsert: { key: string; name: string }[];
  systemsToDeactivate: string[];
  skillsToUpsert: {
    systemKey: string;
    key: string;
    category: "SKILL" | "CONDITION";
    nameEs: string;
    nameEn: string;
    allowsDetail: boolean;
    sortOrder: number;
  }[];
  skillsToDeactivate: { systemKey: string; key: string }[];
};

/**
 * Compares the catalogue files with the database and lists what to write.
 * New or changed (or reactivated) systems and skills are upserted; ones that are
 * gone from the files are only **deactivated**, never deleted, because events
 * and campaigns may still point at them: they stop being offered but history
 * stays valid. An empty set of files deactivates nothing — a deploy that lost
 * the folder must not switch every system off.
 *
 * @param {CatalogFile[]} files - The parsed catalogue files.
 * @param {CatalogCurrent} current - The database's current systems and skills.
 * @returns {CatalogSyncPlan} The writes needed; all empty when already in sync.
 */
export function planCatalogSync(files: CatalogFile[], current: CatalogCurrent): CatalogSyncPlan {
  const plan: CatalogSyncPlan = {
    systemsToUpsert: [],
    systemsToDeactivate: [],
    skillsToUpsert: [],
    skillsToDeactivate: [],
  };

  for (const file of files) {
    const system = current.systems.find((s) => s.key === file.key);
    if (!system || system.name !== file.name || !system.active) {
      plan.systemsToUpsert.push({ key: file.key, name: file.name });
    }

    file.skills.forEach((skill, sortOrder) => {
      const existing = current.skills.find((s) => s.systemKey === file.key && s.key === skill.key);
      const unchanged =
        existing &&
        existing.active &&
        existing.category === skill.category &&
        existing.nameEs === skill.es &&
        existing.nameEn === skill.en &&
        existing.allowsDetail === skill.allowsDetail &&
        existing.sortOrder === sortOrder;
      if (!unchanged) {
        plan.skillsToUpsert.push({
          systemKey: file.key,
          key: skill.key,
          category: skill.category,
          nameEs: skill.es,
          nameEn: skill.en,
          allowsDetail: skill.allowsDetail,
          sortOrder,
        });
      }
    });

    for (const existing of current.skills) {
      if (
        existing.systemKey === file.key &&
        existing.active &&
        !file.skills.some((skill) => skill.key === existing.key)
      ) {
        plan.skillsToDeactivate.push({ systemKey: file.key, key: existing.key });
      }
    }
  }

  if (files.length > 0) {
    for (const system of current.systems) {
      if (system.active && !files.some((file) => file.key === system.key)) {
        plan.systemsToDeactivate.push(system.key);
      }
    }
  }

  return plan;
}
