import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio, deltaE, VISIONS } from "./colorScience";

/*
 * Re-checks the colour-blind-safe palette (the `data-color-vision="safe"` block
 * of globals.css) by parsing the stylesheet itself, so the tokens cannot be
 * edited into something worse without a test failing. It guarantees:
 *   - the five states (S/O/T/N/B) stay apart under normal vision, protanopia,
 *     deuteranopia and tritanopia;
 *   - state colours read as text on the page and on their own soft tint, and
 *     the text drawn on a solid fill reads on it (WCAG 1.4.3, 4.5:1);
 *   - muted ink, brand and borders keep their contrast (1.4.3 / 1.4.11).
 */

type Theme = "light" | "dark";
type Tokens = Record<string, Record<Theme, string>>;

const CSS = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

/**
 * Expands a 3-digit hex colour to 6 digits.
 *
 * @param {string} hex - `#rgb` or `#rrggbb`.
 * @returns {string} `#rrggbb`.
 */
function expandHex(hex: string): string {
  return hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
}

/**
 * Reads the `--color-*: light-dark(a, b)` tokens declared in the first rule whose
 * selector starts with `selector`.
 *
 * @param {string} selector - The exact selector text, e.g. `:root`.
 * @returns {Tokens} Light and dark value per token name (without `--color-`).
 */
function readBlock(selector: string): Tokens {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in globals.css`);
  const body = CSS.slice(start, CSS.indexOf("\n}", start));
  const tokens: Tokens = {};
  for (const match of body.matchAll(
    /--color-([a-z-]+):\s*light-dark\((#[0-9a-f]{3,6}),\s*(#[0-9a-f]{3,6})\)/gi,
  )) {
    tokens[match[1]] = { light: expandHex(match[2]), dark: expandHex(match[3]) };
  }
  return tokens;
}

const SAFE: Tokens = { ...readBlock(":root"), ...readBlock(':root[data-color-vision="safe"]') };
const STATES = ["s", "o", "t", "n", "b"] as const;

/**
 * The safe palette's value of a token in a theme.
 *
 * @param {string} name - Token name without `--color-`.
 * @param {Theme} theme - The theme.
 * @returns {string} A `#rrggbb` colour.
 */
function token(name: string, theme: Theme): string {
  const value = SAFE[name]?.[theme];
  if (!value) throw new Error(`Missing token --color-${name} (${theme})`);
  return value;
}

describe.each(["light", "dark"] as const)("colour-blind-safe palette, %s theme", (theme) => {
  it("keeps the five states apart under every vision", () => {
    for (const vision of VISIONS) {
      for (let i = 0; i < STATES.length; i += 1) {
        for (let j = i + 1; j < STATES.length; j += 1) {
          // ≈0.02 is barely distinguishable; the values were optimised well above that.
          expect(deltaE(token(STATES[i], theme), token(STATES[j], theme), vision)).toBeGreaterThanOrEqual(0.09);
        }
      }
    }
  });

  it.each(STATES)("state %s reads as text on the page, on its tint and under its fill text", (state) => {
    const strong = token(state, theme);
    expect(contrastRatio(strong, token("bg", theme))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(strong, token("bg-elevated", theme))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(strong, token(`${state}-soft`, theme))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token("on-fill", theme), strong)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted ink readable on every surface", () => {
    const muted = token("ink-muted", theme);
    for (const surface of ["bg", "bg-elevated", "brand-soft"]) {
      expect(contrastRatio(muted, token(surface, theme))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps brand readable as text, as a fill and against its tint", () => {
    const brand = token("brand", theme);
    for (const surface of ["bg", "bg-elevated", "brand-soft"]) {
      expect(contrastRatio(brand, token(surface, theme))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(token("on-fill", theme), brand)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws borders at 3:1 and keeps the brand tint visible against the card", () => {
    expect(contrastRatio(token("border", theme), token("bg-elevated", theme))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token("border", theme), token("bg", theme))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token("brand-soft", theme), token("bg-elevated", theme))).toBeGreaterThanOrEqual(1.3);
  });
});
