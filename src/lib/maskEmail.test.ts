import { maskEmail } from "@/lib/maskEmail";

describe("maskEmail", () => {
  it("keeps the first and last character of the local part", () => {
    expect(maskEmail("beatriz@ejemplo.com")).toBe("b*****z@ejemplo.com");
  });

  it("keeps the domain whole, so the recipient can tell which address it is", () => {
    expect(maskEmail("alguien@dmuster.local").split("@")[1]).toBe("dmuster.local");
  });

  it("preserves the local part's length, without revealing it", () => {
    expect(maskEmail("abcdefgh@x.com")).toHaveLength("abcdefgh@x.com".length);
  });

  // "Keep the first and last" would reveal the whole thing at these lengths.
  it.each([
    ["ab@x.com", "**@x.com"],
    ["a@x.com", "*@x.com"],
  ])("hides a very short local part entirely: %p", (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it("splits on the last @, which is the separator", () => {
    expect(maskEmail("we..ird@thing@ejemplo.com")).toBe("w***********g@ejemplo.com");
  });

  it("leaves something without an @ alone rather than mangling it", () => {
    expect(maskEmail("no-es-un-correo")).toBe("no-es-un-correo");
    expect(maskEmail("@solo-dominio")).toBe("@solo-dominio");
  });

  it("never returns the address it was given", () => {
    const address = "beatriz@ejemplo.com";

    expect(maskEmail(address)).not.toBe(address);
  });
});
