/**
 * Print Harbor's accent tokens from the brand seed: npx tsx scripts/brand.ts
 * Paste the output into the matching blocks of src/app/globals.css.
 */
import { BRAND_SEED, accentTokens, contrast, ramp } from "../src/lib/brand";

const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#1f1f23";

const r = ramp(BRAND_SEED);
console.log("ramp", r);
for (const [mode, surface] of [["light", LIGHT_SURFACE], ["dark", DARK_SURFACE]] as const) {
  const t = accentTokens(BRAND_SEED, mode, surface);
  console.log(`\n/* ${mode} */`);
  console.log(`--wf-accent: ${t.accent}; /* white label ${contrast(t.accent, "#ffffff").toFixed(2)}:1 */`);
  console.log(`--wf-accent-hover: ${t.accentHover};`);
  console.log(`--wf-accent-text: ${t.accentText}; /* on soft ${contrast(t.accentText, t.accentSoft).toFixed(2)}:1, on surface ${contrast(t.accentText, surface).toFixed(2)}:1 */`);
  console.log(`--wf-accent-soft: ${t.accentSoft};`);
}
