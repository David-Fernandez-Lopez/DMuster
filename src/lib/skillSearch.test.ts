import type { DiceEventSkill } from "@/lib/diceEventService";
import { filterSkillGroups, foldText } from "@/lib/skillSearch";

function skill(id: string, category: DiceEventSkill["category"], nameEs: string, nameEn: string): DiceEventSkill {
  return { id, key: id.toUpperCase(), category, nameEs, nameEn, allowsDetail: false, requiresDetail: false };
}

const CATALOGUE: DiceEventSkill[] = [
  skill("dying", "CONDITION", "Moribundo", "Dying"),
  skill("perception", "SKILL", "Percepción", "Perception"),
  skill("str", "ATTRIBUTE", "Fuerza", "Strength"),
  skill("stealth", "SKILL", "Sigilo", "Stealth"),
  skill("persuasion", "SKILL", "Persuasión", "Persuasion"),
];

const ids = (groups: ReturnType<typeof filterSkillGroups>) =>
  groups.map((group) => [group.category, group.entries.map((entry) => entry.id)]);

describe("foldText", () => {
  it("lower-cases and strips accents", () => {
    expect(foldText("Percepción")).toBe("percepcion");
    expect(foldText("ÑANDÚ")).toBe("nandu");
  });
});

describe("filterSkillGroups", () => {
  it("lists skills, attributes and conditions in that order, keeping the catalogue order", () => {
    expect(ids(filterSkillGroups(CATALOGUE, ""))).toEqual([
      ["SKILL", ["perception", "stealth", "persuasion"]],
      ["ATTRIBUTE", ["str"]],
      ["CONDITION", ["dying"]],
    ]);
  });

  it("ignores case, accents and surrounding spaces", () => {
    expect(ids(filterSkillGroups(CATALOGUE, "  PERCEPCION "))).toEqual([["SKILL", ["perception"]]]);
  });

  it("matches a part of the name and drops the groups left empty", () => {
    expect(ids(filterSkillGroups(CATALOGUE, "per"))).toEqual([["SKILL", ["perception", "persuasion"]]]);
  });

  it("finds an entry by its name in the other language", () => {
    expect(ids(filterSkillGroups(CATALOGUE, "stealth"))).toEqual([["SKILL", ["stealth"]]]);
    expect(ids(filterSkillGroups(CATALOGUE, "fuerza"))).toEqual([["ATTRIBUTE", ["str"]]]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterSkillGroups(CATALOGUE, "zzz")).toEqual([]);
  });
});
