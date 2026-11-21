/**
 * Harbor's colour algorithm.
 *
 * One seed colour (LightHouse Labs' orange) goes in; every accent token comes
 * out, for light and dark mode, with its contrast guaranteed. Run
 * `npx tsx scripts/brand.ts` to print the tokens for src/app/globals.css, and
 * tests/brand.test.ts fails if globals.css drifts from what this produces or
 * any text/background pair drops below WCAG AA.
 *
 * How it works:
 * 1. Convert the seed to OKLCH, a space where equal steps in lightness look
 *    equal to the eye, so a ramp keeps the seed's hue and feels like one colour.
 * 2. Build a ramp by holding hue, moving lightness, and pulling chroma in at
 *    the ends (very light and very dark oranges can't be that saturated).
 * 3. For each role, pick from the ramp by a rule, not by eye:
 *    - accent (button fill): the lightest step that holds 4.5:1 against its
 *      white label, so it stays as close to the seed as accessibility allows.
 *    - accent-soft (selected, chips): the lightest tint that is still visibly
 *      orange against white.
 *    - accent-text (orange text on soft or white): the lightest step with 4.5:1
 *      on the soft tint.
 *    Dark mode runs the same rules against the dark surface.
 */

export type Rgb = [number, number, number];
export type Oklch = { l: number; c: number; h: number };

export const BRAND_SEED = "#ed701d"; // LightHouse Labs "tiger orange", hsl(24 85% 52%)

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** WCAG 2 relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToRgb({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear) as Rgb;
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** OKLCH to hex, reducing chroma until the colour fits in sRGB so the hue never shifts. */
export function oklchToHex(c: Oklch): string {
  let lo = 0;
  let hi = c.c;
  if (inGamut(oklchToRgb(c))) return rgbToHex(oklchToRgb(c));
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ ...c, c: mid }))) lo = mid;
    else hi = mid;
  }
  return rgbToHex(oklchToRgb({ ...c, c: lo }));
}

/** Lightness steps, light to dark, named like Tailwind's 50 to 950. */
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHTNESS = [0.975, 0.945, 0.89, 0.82, 0.74, 0.68, 0.6, 0.52, 0.44, 0.37, 0.27];

/** A ramp that keeps the seed's hue; chroma follows a curve that peaks around the seed and eases off at the ends. */
export function ramp(seed: string): Record<(typeof STEPS)[number], string> {
  const s = hexToOklch(seed);
  const out = {} as Record<(typeof STEPS)[number], string>;
  STEPS.forEach((step, i) => {
    const l = LIGHTNESS[i];
    const distance = Math.abs(l - s.l) / Math.max(s.l, 1 - s.l);
    const chroma = s.c * (1 - 0.85 * distance ** 1.6);
    out[step] = oklchToHex({ l, c: Math.max(0, chroma), h: s.h });
  });
  return out;
}

/** The seed with its lightness set to `l`, chroma eased the same way the ramp does. */
function atLightness(seed: string, l: number): string {
  const s = hexToOklch(seed);
  const distance = Math.abs(l - s.l) / Math.max(s.l, 1 - s.l);
  return oklchToHex({ l, c: Math.max(0, s.c * (1 - 0.85 * distance ** 1.6)), h: s.h });
}

/**
 * Start at the seed and move its lightness one small step at a time (darker
 * or lighter) until `ok` passes. The first colour that passes is the one
 * closest to the brand that still meets the rule.
 */
export function solve(seed: string, direction: "darker" | "lighter", ok: (hex: string) => boolean): string {
  const start = hexToOklch(seed).l;
  for (let l = start; l >= 0 && l <= 1; l += direction === "darker" ? -0.0025 : 0.0025) {
    const c = atLightness(seed, l);
    if (ok(c)) return c;
  }
  throw new Error("No lightness meets the contrast rule; pick a different seed.");
}

export const AA = 4.5;

export type AccentTokens = { accent: string; accentHover: string; accentText: string; accentSoft: string; onAccent: string; brand: string };

/**
 * Accent roles for one theme. `surface` is the background accent text sits on
 * most (white in light mode, the dark surface in dark mode).
 */
export function accentTokens(seed: string, mode: "light" | "dark", surface: string): AccentTokens {
  const white = "#ffffff";
  const seedL = hexToOklch(seed).l;
  // Button fill: white label at 4.5:1, as near the seed as that allows. Hover is one visible step darker.
  const accent = solve(seed, "darker", (c) => contrast(c, white) >= AA);
  const accentHover = atLightness(seed, hexToOklch(accent).l - 0.05);
  if (mode === "light") {
    // A tint you can see on white without it shouting: the seed washed over the surface until about 1.1:1.
    let amount = 0.02;
    while (contrast(mix(seed, surface, amount), surface) < 1.1) amount += 0.01;
    const accentSoft = mix(seed, surface, amount);
    const accentText = solve(seed, "darker", (c) => contrast(c, accentSoft) >= AA && contrast(c, surface) >= AA);
    return { accent, accentHover, accentText, accentSoft, onAccent: white, brand: seed };
  }
  // Dark mode: a low, warm wash of the brand over the surface, and text that is the
  // most saturated orange that still reads on both.
  const accentSoft = mix(atLightness(seed, seedL - 0.12), surface, 0.24);
  const accentText = solve(seed, "lighter", (c) => contrast(c, accentSoft) >= AA && contrast(c, surface) >= AA);
  return { accent, accentHover, accentText, accentSoft, onAccent: white, brand: seed };
}

/** sRGB mix: `amount` of `a` over `b`. */
export function mix(a: string, b: string, amount: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v * amount + y[i] * (1 - amount)) as Rgb);
}
