import { queuePush } from "./push";
import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { rowsOf, schema } from "@/db";

const SCRIPTS: [RegExp, string][] = [
  [/[ऀ-ॿ]/, "hi"],
  [/[ഀ-ൿ]/, "ml"],
  [/[஀-௿]/, "ta"],
  [/[ఀ-౿]/, "te"],
  [/[ಀ-೿]/, "kn"],
  [/[ঀ-৿]/, "bn"],
  [/[઀-૿]/, "gu"],
  [/[਀-੿]/, "pa"],
  [/[؀-ۿ]/, "ar"],
];

export const LANGUAGES: Record<string, string> = {
  en: "English",
  hi: "Hindi or Marathi",
  ml: "Malayalam",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  bn: "Bengali",
  gu: "Gujarati",
  pa: "Punjabi",
  ar: "Arabic or Urdu",
};

/** Guess the language from its script. Latin script counts as English. */
export function detectLanguage(text: string): string | null {
  for (const [re, code] of SCRIPTS) if (re.test(text)) return code;
  return /[a-z]/i.test(text) ? "en" : null;
}

function keywordHit(text: string, keywords: string[]) {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return keywords.some((k) => {
    const w = k.trim().toLowerCase();
    return w && t.includes(` ${w} `);
  });
}

/**
 * Apply the first matching rule to a new chat: assign it, label it, or both.
 * Returns the rule that matched, if any.
 */
export async function routeConversation(d: DB, orgId: string, conversationId: string, text: string) {
  const rules = await d
    .select()
    .from(schema.routingRules)
    .where(and(eq(schema.routingRules.orgId, orgId), eq(schema.routingRules.active, true)))
    .orderBy(asc(schema.routingRules.position), asc(schema.routingRules.createdAt));
  if (!rules.length) return null;
  const lang = detectLanguage(text);
  const rule = rules.find((r) => (r.match === "keyword" ? keywordHit(text, r.values) : lang !== null && r.values.includes(lang)));
  if (!rule) return null;

  let assigneeId: string | null = null;
  if (rule.assignMode === "user" && rule.assigneeId) {
    const [m] = await d
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, rule.assigneeId)))
      .limit(1);
    assigneeId = m ? rule.assigneeId : null;
  } else if (rule.assignMode === "least_busy") {
    const rows = await d.execute(sql`
      select m.user_id from memberships m
      left join conversations c on c.assignee_id = m.user_id and c.org_id = m.org_id and c.status = 'open'
      where m.org_id = ${orgId}
      group by m.user_id
      order by count(c.id) asc, min(m.user_id::text) asc
      limit 1`);
    assigneeId = rowsOf<{ user_id: string }>(rows)[0]?.user_id ?? null;
  }
  await d
    .update(schema.conversations)
    .set({
      ...(assigneeId ? { assigneeId } : {}),
      ...(rule.label ? { labels: sql`array(select distinct unnest(${schema.conversations.labels} || array[${rule.label}]::text[]))` } : {}),
    })
    .where(eq(schema.conversations.id, conversationId));
  await d.update(schema.routingRules).set({ hits: sql`${schema.routingRules.hits} + 1` }).where(eq(schema.routingRules.id, rule.id));
  if (assigneeId) await queuePush(d, "assigned", { conversationId }).catch(() => {});
  return { rule, assigneeId };
}
