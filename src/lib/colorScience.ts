/*
 * Colour maths shared by the palette quality tests: CSS colour → linear sRGB
 * (hex or `oklch()`, reducing chroma until the colour fits the sRGB gamut, as
 * CSS does), colour-blindness simulation (Machado 2009, full severity), OKLab
 * distance and WCAG contrast. Test support only: nothing in the app imports it.
 */

export type Vec3 = [number, number, number];
export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

/** Every vision a palette is checked under. */
export const VISIONS: Vision[] = ["normal", "protanopia", "deuteranopia", "tritanopia"];

const MACHADO: Record<Exclude<Vision, "normal">, [Vec3, Vec3, Vec3]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/**
 * Parses `oklch(L C h)`.
 *
 * @param {string} css - A CSS oklch colour.
 * @returns {Vec3} Lightness, chroma, hue in degrees.
 * @throws {Error} When the string is not an `oklch()` colour.
 */
function parseOklch(css: string): Vec3 {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(css);
  if (!match) throw new Error(`Not an oklch() colour: ${css}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * OKLCH → linear sRGB, lowering chroma step by step until the colour is in gamut.
 *
 * @param {string} css - A CSS oklch colour.
 * @returns {Vec3} Linear sRGB in 0..1.
 */
function oklchToLinear(css: string): Vec3 {
  const [lightness, chroma, hue] = parseOklch(css);
  let rgb: Vec3 = [0, 0, 0];
  for (let step = 0; step < 40; step += 1) {
    const c = chroma * (1 - step * 0.025);
    const a = c * Math.cos((hue * Math.PI) / 180);
    const b = c * Math.sin((hue * Math.PI) / 180);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (rgb.every((x) => x >= -1e-4 && x <= 1 + 1e-4)) break;
  }
  return rgb.map((x) => Math.min(1, Math.max(0, x))) as Vec3;
}

/**
 * Linear sRGB of a `#rrggbb` colour.
 *
 * @param {string} hex - A hex colour.
 * @returns {Vec3} Linear sRGB.
 */
function hexToLinear(hex: string): Vec3 {
  const channel = (offset: number) => {
    const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

/**
 * Linear sRGB of a CSS colour, `#rrggbb` or `oklch(L C h)`.
 *
 * @param {string} css - The colour.
 * @returns {Vec3} Linear sRGB in 0..1.
 * @throws {Error} When the colour is in neither supported notation.
 */
export function toLinear(css: string): Vec3 {
  const value = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return hexToLinear(value);
  return oklchToLinear(value);
}

/**
 * Applies a colour-blindness simulation to a linear sRGB colour.
 *
 * @param {Vec3} rgb - Linear sRGB.
 * @param {Vision} vision - The vision to simulate.
 * @returns {Vec3} Linear sRGB as that vision sees it.
 */
export function simulate(rgb: Vec3, vision: Vision): Vec3 {
  if (vision === "normal") return rgb;
  const matrix = MACHADO[vision];
  return matrix.map((row) =>
    Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])),
  ) as Vec3;
}

/**
 * Linear sRGB → OKLab.
 *
 * @param {Vec3} rgb - Linear sRGB.
 * @returns {Vec3} L, a, b.
 */
export function toOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Relative luminance of a linear sRGB colour.
 *
 * @param {Vec3} rgb - Linear sRGB.
 * @returns {number} Luminance.
 */
export function luminance([r, g, b]: Vec3): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two CSS colours.
 *
 * @param {string} a - One colour.
 * @param {string} b - The other colour.
 * @returns {number} The ratio, 1..21.
 */
export function contrastRatio(a: string, b: string): number {
  const ya = luminance(toLinear(a));
  const yb = luminance(toLinear(b));
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}

/**
 * OKLab distance between two CSS colours as a given vision sees them.
 *
 * @param {string} a - One colour.
 * @param {string} b - The other colour.
 * @param {Vision} vision - The vision to simulate.
 * @returns {number} ΔE (≈0.02 is barely distinguishable).
 */
export function deltaE(a: string, b: string, vision: Vision): number {
  const la = toOklab(simulate(toLinear(a), vision));
  const lb = toOklab(simulate(toLinear(b), vision));
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
