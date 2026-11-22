import { normalizeSkill } from "@/lib/diceSkill";

describe("normalizeSkill", () => {
  it("trims, collapses whitespace and upper-cases", () => {
    expect(normalizeSkill("  lore:   hogar ")).toBe("LORE: HOGAR");
  });

  it("keeps accents and the letter ñ", () => {
    expect(normalizeSkill("engaño")).toBe("ENGAÑO");
    expect(normalizeSkill("Percepción")).toBe("PERCEPCIÓN");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeSkill("   ")).toBe("");
  });
});
