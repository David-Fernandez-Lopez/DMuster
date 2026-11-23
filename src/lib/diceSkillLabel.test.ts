import { skillLabel, skillName } from "@/lib/diceSkillLabel";

const lore = { nameEs: "Saber", nameEn: "Lore" };

describe("skillName", () => {
  it("picks English for en locales and Spanish otherwise", () => {
    expect(skillName(lore, "en")).toBe("Lore");
    expect(skillName(lore, "en-GB")).toBe("Lore");
    expect(skillName(lore, "es")).toBe("Saber");
    expect(skillName(lore, "fr")).toBe("Saber");
  });
});

describe("skillLabel", () => {
  it("appends the detail when there is one", () => {
    expect(skillLabel(lore, "GUILD", "es")).toBe("Saber: GUILD");
    expect(skillLabel(lore, null, "en")).toBe("Lore");
  });
});
