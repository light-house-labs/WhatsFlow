import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { formatMoney } from "./plans";
import { sendInConversation } from "./wa/outbound";

const HANDOVER = "[HANDOVER]";
const model = () => process.env.AI_MODEL || "claude-opus-5-5";

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function aiSettingsFor(d: DB, orgId: string) {
  const [s] = await d.select().from(schema.aiSettings).where(eq(schema.aiSettings.orgId, orgId)).limit(1);
  if (s) return s;
  await d.insert(schema.aiSettings).values({ orgId }).onConflictDoNothing();
  return (await d.select().from(schema.aiSettings).where(eq(schema.aiSettings.orgId, orgId)))[0];
}

/** The stable part of the prompt: rules plus everything the business told us. Cached between replies. */
export function systemPrompt(o: { orgName: string; businessInfo: string; faqs: string; catalog: string }) {
  return [
    `You answer WhatsApp messages from customers of ${o.orgName}, on the business's behalf.`,
    "Write like a helpful person at the front desk: short (one to four sentences), plain, warm, in the customer's language. WhatsApp formatting only (*bold*, lists with •); no markdown headings or links you were not given.",
    "Only state facts found in the business information, FAQs or catalog below. Never invent prices, availability, policies, opening hours or promises.",
    `If the answer is not in that material, the customer asks for a person, is upset, or wants something only staff can do (refunds, complaints, medical or legal advice, changing an order), reply with exactly ${HANDOVER} and nothing else. A teammate will take over.`,
    "",
    "<business_information>",
    o.businessInfo || "(none provided)",
    "</business_information>",
    "<faqs>",
    o.faqs || "(none provided)",
    "</faqs>",
    "<catalog>",
    o.catalog || "(none provided)",
    "</catalog>",
  ].join("\n");
}

/** Turn recent messages into a valid alternating transcript that starts with the customer. */
export function toTranscript(rows: { direction: "in" | "out"; body: string | null }[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const r of rows) {
    const text = (r.body ?? "").trim();
    if (!text) continue;
    const role = r.direction === "in" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last?.role === role) last.content = `${last.content as string}\n${text}`;
    else out.push({ role, content: text });
  }
  while (out[0]?.role === "assistant") out.shift();
  while (out.length && out[out.length - 1].role === "assistant") out.pop();
  return out;
}

type Ask = (system: string, messages: Anthropic.MessageParam[]) => Promise<string | null>;

const askClaude: Ask = async (system, messages) => {
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: model(),
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (res.stop_reason === "refusal") return null;
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
};

let ask: Ask = askClaude;
/** Tests swap the model call for a stub. */
export function setAiClientForTests(fn: Ask | null) {
  ask = fn ?? askClaude;
}

/**
 * Answer a customer message with AI when no bot flow handled it.
 * Returns handled=false when AI is off, so the inbox takes it as usual.
 */
export async function aiReply(
  d: DB,
  a: { orgId: string; conversationId: string; text: string; isNewThread: boolean },
): Promise<{ handled: boolean; handedOver: boolean }> {
  const s = await aiSettingsFor(d, a.orgId);
  if (!s.enabled || (!aiAvailable() && ask === askClaude)) return { handled: false, handedOver: false };
  const [conv] = await d.select().from(schema.conversations).where(eq(schema.conversations.id, a.conversationId)).limit(1);
  if (!conv || (conv.handledBy === "human" && !a.isNewThread)) return { handled: false, handedOver: false };
  const used = a.isNewThread ? 0 : conv.aiReplies;

  const lower = a.text.toLowerCase();
  const wantsPerson = s.handoverKeywords.some((k) => k.trim() && lower.includes(k.trim().toLowerCase()));
  if (wantsPerson || used >= s.maxReplies) return handover(d, a.conversationId);

  const [org] = await d.select({ name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.id, a.orgId));
  const catalog = s.includeCatalog
    ? (
        await d
          .select()
          .from(schema.products)
          .where(and(eq(schema.products.orgId, a.orgId), eq(schema.products.active, true)))
          .limit(100)
      )
        .map((p) => `- ${p.name}: ${formatMoney(p.priceMinor, p.currency)}${p.stock === 0 ? " (out of stock)" : ""}${p.description ? ` — ${p.description}` : ""}`)
        .join("\n")
    : "";
  const recent = await d
    .select({ direction: schema.messages.direction, body: schema.messages.body })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, a.conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(20);
  const transcript = toTranscript(recent.reverse());
  if (!transcript.length) return { handled: false, handedOver: false };

  let answer: string | null;
  try {
    answer = await ask(systemPrompt({ orgName: org.name, businessInfo: s.businessInfo, faqs: s.faqs, catalog }), transcript);
  } catch (e) {
    console.error("[ai]", e);
    return handover(d, a.conversationId);
  }
  if (!answer || answer.includes(HANDOVER)) return handover(d, a.conversationId);

  await sendInConversation(d, a.conversationId, { kind: "text", body: answer.slice(0, 4096) }, { senderKind: "bot" });
  await d
    .update(schema.conversations)
    .set({ handledBy: "bot", aiReplies: used + 1, waitingSince: null })
    .where(eq(schema.conversations.id, a.conversationId));
  return { handled: true, handedOver: false };
}

async function handover(d: DB, conversationId: string) {
  await sendInConversation(d, conversationId, { kind: "text", body: "Let me get someone from our team to help you with that." }, { senderKind: "bot" });
  await d
    .update(schema.conversations)
    .set({ handledBy: "human", waitingSince: new Date() })
    .where(eq(schema.conversations.id, conversationId));
  return { handled: true, handedOver: true };
}
