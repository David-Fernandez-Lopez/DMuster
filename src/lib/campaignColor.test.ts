import {
  campaignColor,
  campaignTint,
  nextFreeSlot,
  PALETTE,
  PALETTE_SIZE,
  PICKER_SLOT_COUNT,
} from "./campaignColor";

import { contrastRatio, deltaE, VISIONS, type Vision } from "./colorScience";

/** Card backgrounds of the two themes (globals.css: --color-bg-elevated). */
const BACKGROUND = { light: "#f8f3ea", dark: "#1c2c24" } as const;

/**
 * Smallest OKLab distance between any two of the first `count` colours of a theme.
 *
 * @param {"light" | "dark"} theme - The theme.
 * @param {number} count - How many leading slots to compare.
 * @param {Vision} vision - The vision to simulate.
 * @returns {number} The smallest ΔE.
 */
function minDistance(theme: "light" | "dark", count: number, vision: Vision): number {
  const colours = PALETTE.slice(0, count).map((entry) => entry[theme]);
  let min = Infinity;
  for (let i = 0; i < colours.length; i += 1) {
    for (let j = i + 1; j < colours.length; j += 1) {
      min = Math.min(min, deltaE(colours[i], colours[j], vision));
    }
  }
  return min;
}

describe("PALETTE quality", () => {
  it("has twelve colours the picker offers", () => {
    expect(PALETTE_SIZE).toBe(12);
    expect(PICKER_SLOT_COUNT).toBe(PALETTE_SIZE);
  });

  describe.each(["light", "dark"] as const)("%s theme", (theme) => {
    it.each([6, 10, 12])("keeps the first %i slots apart under every vision", (count) => {
      for (const vision of VISIONS) {
        // ≈0.02 is barely distinguishable; the table was optimised well above that.
        const floor = vision === "normal" ? 0.08 : 0.06;
        expect(minDistance(theme, count, vision)).toBeGreaterThanOrEqual(floor);
      }
    });

    it("keeps every colour at least 3:1 against the card background (WCAG 1.4.11)", () => {
      for (const entry of PALETTE) {
        expect(contrastRatio(entry[theme], BACKGROUND[theme])).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

describe("campaignColor / campaignTint", () => {
  it("builds a light-dark() from the table for slots 0–11", () => {
    expect(campaignColor(3)).toBe(`light-dark(${PALETTE[3].light}, ${PALETTE[3].dark})`);
  });

  it("falls back to a generated colour from slot 12 on", () => {
    expect(campaignColor(12)).toMatch(/^light-dark\(oklch\(.+\), oklch\(.+\)\)$/);
  });

  it("differs from slot to slot, fallback included", () => {
    const colors = Array.from({ length: 24 }, (_, slot) => campaignColor(slot));
    expect(new Set(colors).size).toBe(24);
  });

  it("builds the tint from the same colour", () => {
    expect(campaignTint(3)).toContain(campaignColor(3));
  });
});

describe("nextFreeSlot", () => {
  it("starts at 0 for no campaigns", () => {
    expect(nextFreeSlot([])).toBe(0);
  });

  it("takes the smallest free slot, filling gaps first", () => {
    expect(nextFreeSlot([0, 1, 3])).toBe(2);
    expect(nextFreeSlot([2, 0, 1])).toBe(3);
  });

  it("copes with repeats", () => {
    expect(nextFreeSlot([0, 0, 1, 1])).toBe(2);
  });
});
