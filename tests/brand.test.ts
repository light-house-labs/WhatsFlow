import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AA, BRAND_SEED, accentTokens, contrast, hexToOklch, mix } from "@/lib/brand";
import { BRAND_ORANGE } from "@/components/logo-mark";

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** Hex tokens declared in one block of globals.css, with var() references resolved. */
function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("\n}", start));
  const raw: Record<string, string> = {};
  for (const m of block.matchAll(/--wf-([\w-]+):\s*([^;]+);/g)) raw[m[1]] = m[2].trim();
  return raw;
}

function theme(mode: "light" | "dark") {
  const light = tokens(":root");
  const all = mode === "light" ? light : { ...light, ...tokens(".dark") };
  const resolve = (v: string): string => {
    const ref = v.match(/^var\(--wf-([\w-]+)\)$/);
    return ref ? resolve(all[ref[1]]) : v;
  };
  return (name: string) => {
    const v = resolve(all[name]);
    if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--wf-${name} is not a plain hex colour: ${v}`);
    return v;
  };
}

// Every pair the UI actually draws text on, with the minimum it must hold.
const TEXT_PAIRS: [fg: string, bg: string, min: number][] = [
  ["text", "surface", AA],
  ["text", "canvas", AA],
  ["text", "fill", AA],
  ["text-muted", "surface", AA],
  ["text-muted", "canvas", AA],
  ["text-muted", "fill", AA],
  ["text-faint", "surface", AA],
  ["text-faint", "canvas", AA],
  ["on-accent", "accent", AA],
  ["on-accent", "accent-hover", AA],
  ["accent-text", "accent-soft", AA],
  ["accent-text", "surface", AA],
  ["text", "bubble-out", AA],
  ["text", "bubble-agent", AA],
  ["danger", "surface", AA],
  ["success", "surface", AA],
  ["warning", "surface", AA],
  ["warning", "warning-soft", AA],
  ["placeholder", "field", 1.9],
  ["border-input", "surface", 1.2],
];

describe("brand algorithm", () => {
  it("starts from the LightHouse Labs orange, and the logo uses the same seed", () => {
    expect(BRAND_SEED).toBe("#ed701d");
    expect(BRAND_ORANGE).toBe(BRAND_SEED);
    expect(tokens(":root").brand).toBe(BRAND_SEED);
  });

  it("keeps the accent in the seed's hue family", () => {
    const seed = hexToOklch(BRAND_SEED).h;
    for (const mode of ["light", "dark"] as const) {
      const t = accentTokens(BRAND_SEED, mode, mode === "light" ? "#ffffff" : "#1f1f23");
      for (const c of [t.accent, t.accentHover, t.accentText]) expect(Math.abs(hexToOklch(c).h - seed)).toBeLessThan(12);
    }
  });

  it("picks the button colour closest to the seed that still passes AA", () => {
    const { accent } = accentTokens(BRAND_SEED, "light", "#ffffff");
    expect(contrast(accent, "#ffffff")).toBeGreaterThanOrEqual(AA);
    expect(contrast(accent, "#ffffff")).toBeLessThan(AA + 0.15); // no darker than it has to be
  });

  it("mixes colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe.each(["light", "dark"] as const)("globals.css %s theme", (mode) => {
  const get = theme(mode);
  const surface = get("surface");

  it("uses the accent tokens the algorithm produces", () => {
    const t = accentTokens(BRAND_SEED, mode, surface);
    expect(get("accent")).toBe(t.accent);
    expect(get("accent-hover")).toBe(t.accentHover);
    expect(get("accent-text")).toBe(t.accentText);
    expect(get("accent-soft")).toBe(t.accentSoft);
  });

  it.each(TEXT_PAIRS)("%s on %s meets %s:1", (fg, bg, min) => {
    expect(contrast(get(fg), get(bg))).toBeGreaterThanOrEqual(min);
  });
});
