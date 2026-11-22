import { COLOR_VISIONS, isColorVision } from "./colorVision";

describe("isColorVision", () => {
  it.each(COLOR_VISIONS)("accepts %s", (value) => {
    expect(isColorVision(value)).toBe(true);
  });

  it.each([null, undefined, "", "safe", "PROTAN", 1, true, {}])("rejects %p", (value) => {
    expect(isColorVision(value)).toBe(false);
  });
});
