import {
  campaignColor,
  campaignHue,
  campaignTint,
  nextFreeSlot,
  PICKER_SLOT_COUNT,
} from "./campaignColor";

describe("campaignHue", () => {
  it("keeps the first twelve hues at least 20 degrees apart", () => {
    const hues = Array.from({ length: 12 }, (_, slot) => campaignHue(slot)).sort((a, b) => a - b);
    const gaps = hues.map((hue, index) => (hues[(index + 1) % hues.length] - hue + 360) % 360);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(20);
  });

  it("stays within 0..360 and is distinct for every picker slot", () => {
    const hues = Array.from({ length: PICKER_SLOT_COUNT }, (_, slot) => campaignHue(slot));
    expect(hues.every((hue) => hue >= 0 && hue < 360)).toBe(true);
    expect(new Set(hues.map((hue) => hue.toFixed(1))).size).toBe(PICKER_SLOT_COUNT);
  });
});

describe("campaignColor / campaignTint", () => {
  it("gives a light and a dark variant", () => {
    expect(campaignColor(0)).toMatch(/^light-dark\(oklch\(.+\), oklch\(.+\)\)$/);
  });

  it("differs from slot to slot", () => {
    const colors = Array.from({ length: PICKER_SLOT_COUNT }, (_, slot) => campaignColor(slot));
    expect(new Set(colors).size).toBe(PICKER_SLOT_COUNT);
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
