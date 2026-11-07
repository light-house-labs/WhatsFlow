import type { DB } from "@/db";
import { schema } from "@/db";
import { DEFAULT_HOURS } from "./hours";
import { randomToken } from "./crypto";

export const INDUSTRIES = [
  "Clinic or healthcare",
  "Online store",
  "Real estate",
  "Education",
  "Restaurant or cafe",
  "Salon or spa",
  "Services",
  "Other",
] as const;

const TRIAL_DAYS = 14;

/** Create a workspace with sensible defaults and a sandbox number so it works on minute one. */
export async function createWorkspace(d: DB, userId: string, name: string, industry: string | null) {
  return d.transaction(async (tx) => {
    const [org] = await tx
      .insert(schema.orgs)
      .values({
        name,
        industry,
        plan: "trial",
        billingStatus: "trialing",
        currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS * 86400_000),
      })
      .returning();
    await tx.insert(schema.memberships).values({ orgId: org.id, userId, role: "owner" });
    await tx.insert(schema.inboxSettings).values({
      orgId: org.id,
      welcomeMessage: `Hi! Thanks for messaging ${name}. How can we help you today?`,
      awayMessage: `Thanks for your message. We're closed right now and will reply when we open.`,
      businessHours: DEFAULT_HOURS,
      optOutKeywords: ["STOP", "UNSUBSCRIBE", "Stop offers"],
    });
    await tx.insert(schema.pipelineStages).values(
      [
        ["New", "open"],
        ["Contacted", "open"],
        ["Qualified", "open"],
        ["Proposal sent", "open"],
        ["Won", "won"],
        ["Lost", "lost"],
      ].map(([stage, kind], i) => ({
        orgId: org.id,
        name: stage,
        position: i,
        kind: kind as "open" | "won" | "lost",
      })),
    );
    await tx.insert(schema.waNumbers).values({
      orgId: org.id,
      provider: "sandbox",
      displayPhone: "+91 00000 " + String(Math.floor(10000 + Math.random() * 89999)),
      displayName: name,
      verifyToken: randomToken(16),
      status: "connected",
      qualityRating: "GREEN",
      messagingTier: "TIER_1K",
    });
    await tx.insert(schema.quickReplies).values([
      { orgId: org.id, shortcut: "hours", body: "We're open Monday to Friday 9am–6pm and Saturday 10am–2pm." },
      { orgId: org.id, shortcut: "thanks", body: "Thank you! Is there anything else we can help with?" },
    ]);
    await tx.insert(schema.botFlows).values({
      orgId: org.id,
      name: "Welcome menu",
      status: "draft",
      trigger: { kind: "keyword", keywords: ["hi", "hello", "menu"] },
      graph: starterFlow(),
    });
    return org;
  });
}

export function starterFlow() {
  return {
    nodes: [
      { id: "t", type: "trigger" as const, position: { x: 40, y: 140 }, data: {} },
      {
        id: "m1",
        type: "buttons" as const,
        position: { x: 300, y: 120 },
        data: { text: "Hi! What can we help you with?", buttons: ["Prices", "Book a visit", "Talk to us"] },
      },
      { id: "m2", type: "message" as const, position: { x: 620, y: 20 }, data: { text: "Our price list: …" } },
      {
        id: "q1",
        type: "question" as const,
        position: { x: 620, y: 160 },
        data: { text: "Great! What day suits you?", saveAs: "preferred_day" },
      },
      { id: "l1", type: "lead" as const, position: { x: 900, y: 160 }, data: { title: "Visit request" } },
      { id: "h1", type: "handover" as const, position: { x: 620, y: 300 }, data: { text: "Connecting you to our team now." } },
    ],
    edges: [
      { id: "e1", source: "t", target: "m1" },
      { id: "e2", source: "m1", target: "m2", sourceHandle: "0" },
      { id: "e3", source: "m1", target: "q1", sourceHandle: "1" },
      { id: "e4", source: "m1", target: "h1", sourceHandle: "2" },
      { id: "e5", source: "q1", target: "l1" },
    ],
  };
}
