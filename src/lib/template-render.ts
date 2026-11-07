/** Count {{1}}, {{2}}… placeholders in a template body. */
export function placeholderCount(body: string): number {
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/** Placeholders must be numbered 1..n with no gaps, which is what Meta accepts. */
export function validatePlaceholders(body: string): string | null {
  const nums = [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) return `Variables must be numbered {{1}} to {{${nums.length}}} with no gaps.`;
  }
  return null;
}

export function render(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1] ?? `{{${n}}}`);
}

type ContactLike = { name: string | null; waId: string; customFields: Record<string, string> };

/**
 * Resolve campaign variable mapping for one contact.
 * Mapping value "name" | "phone" | "field:<key>" | "=<literal>".
 */
export function resolveVariables(map: Record<string, string>, count: number, contact: ContactLike): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const m = map[String(i)] ?? "";
    let v = "";
    if (m.startsWith("=")) v = m.slice(1);
    else if (m === "name") v = contact.name?.split(" ")[0] || "there";
    else if (m === "phone") v = contact.waId;
    else if (m.startsWith("field:")) v = contact.customFields[m.slice(6)] ?? "";
    out.push(v);
  }
  return out;
}

/** Meta template names: lowercase letters, digits and underscores. */
export function slugTemplateName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 512);
}
