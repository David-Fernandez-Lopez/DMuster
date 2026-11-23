import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type CatalogCurrent,
  type CatalogFile,
  catalogFileSchema,
  planCatalogSync,
} from "@/lib/systemCatalog";

const file: CatalogFile = catalogFileSchema.parse({
  key: "pathfinder-2e",
  name: "Pathfinder 2e",
  skills: [
    { key: "PERCEPTION", category: "SKILL", es: "Percepción", en: "Perception" },
    { key: "LORE", category: "SKILL", es: "Saber", en: "Lore", allowsDetail: true },
    { key: "DYING", category: "CONDITION", es: "A punto de morir", en: "Dying" },
  ],
});

/** The database state that exactly matches `file`. */
function inSync(): CatalogCurrent {
  return {
    systems: [{ key: "pathfinder-2e", name: "Pathfinder 2e", active: true }],
    skills: file.skills.map((skill, sortOrder) => ({
      systemKey: "pathfinder-2e",
      key: skill.key,
      category: skill.category,
      nameEs: skill.es,
      nameEn: skill.en,
      allowsDetail: skill.allowsDetail,
      sortOrder,
      active: true,
    })),
  };
}

describe("catalogFileSchema", () => {
  it("defaults allowsDetail to false", () => {
    expect(file.skills[0].allowsDetail).toBe(false);
    expect(file.skills[1].allowsDetail).toBe(true);
  });

  it("rejects duplicate keys inside a file", () => {
    const duplicated = {
      key: "x",
      name: "X",
      skills: [
        { key: "A", category: "SKILL", es: "a", en: "a" },
        { key: "A", category: "CONDITION", es: "b", en: "b" },
      ],
    };

    expect(catalogFileSchema.safeParse(duplicated).success).toBe(false);
  });

  it.each([
    [{ key: "Bad Key", name: "X", skills: [] }],
    [{ key: "x", name: "", skills: [] }],
    [{ key: "x", name: "X", skills: [{ key: "lower", category: "SKILL", es: "a", en: "a" }] }],
    [{ key: "x", name: "X", skills: [{ key: "A", category: "OTHER", es: "a", en: "a" }] }],
    [{ key: "x", name: "X", skills: [{ key: "A", category: "SKILL", es: "", en: "a" }] }],
  ])("rejects an invalid file (%#)", (bad) => {
    expect(catalogFileSchema.safeParse(bad).success).toBe(false);
  });
});

describe("planCatalogSync", () => {
  it("is empty when the database already matches (idempotent)", () => {
    expect(planCatalogSync([file], inSync())).toEqual({
      systemsToUpsert: [],
      systemsToDeactivate: [],
      skillsToUpsert: [],
      skillsToDeactivate: [],
    });
  });

  it("creates everything on an empty database, with the file order as sortOrder", () => {
    const plan = planCatalogSync([file], { systems: [], skills: [] });

    expect(plan.systemsToUpsert).toEqual([{ key: "pathfinder-2e", name: "Pathfinder 2e" }]);
    expect(plan.skillsToUpsert.map((s) => [s.key, s.sortOrder])).toEqual([
      ["PERCEPTION", 0],
      ["LORE", 1],
      ["DYING", 2],
    ]);
  });

  it("writes only what changed", () => {
    const current = inSync();
    current.skills[0].nameEn = "Old name";

    const plan = planCatalogSync([file], current);

    expect(plan.skillsToUpsert.map((s) => s.key)).toEqual(["PERCEPTION"]);
    expect(plan.systemsToUpsert).toEqual([]);
  });

  it("reactivates an entry that is back in the file", () => {
    const current = inSync();
    current.skills[2].active = false;

    expect(planCatalogSync([file], current).skillsToUpsert.map((s) => s.key)).toEqual(["DYING"]);
  });

  it("deactivates, never deletes, what disappeared from the file", () => {
    const current = inSync();
    current.skills.push({
      systemKey: "pathfinder-2e",
      key: "GONE",
      category: "SKILL",
      nameEs: "x",
      nameEn: "x",
      allowsDetail: false,
      sortOrder: 9,
      active: true,
    });
    current.systems.push({ key: "old-system", name: "Old", active: true });

    const plan = planCatalogSync([file], current);

    expect(plan.skillsToDeactivate).toEqual([{ systemKey: "pathfinder-2e", key: "GONE" }]);
    expect(plan.systemsToDeactivate).toEqual(["old-system"]);
  });

  it("deactivates nothing when no file was found at all", () => {
    expect(planCatalogSync([], inSync()).systemsToDeactivate).toEqual([]);
  });
});

describe("the catalogue files in prisma/catalog", () => {
  const dir = join(__dirname, "../../prisma/catalog");
  const names = readdirSync(dir).filter((name) => name.endsWith(".json") && !name.startsWith("_"));

  it("are all valid, with unique system keys", () => {
    const keys = names.map((name) => catalogFileSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8"))).key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the template valid, so it stays a working example", () => {
    expect(catalogFileSchema.safeParse(JSON.parse(readFileSync(join(dir, "_template.json"), "utf8"))).success).toBe(true);
  });
});
