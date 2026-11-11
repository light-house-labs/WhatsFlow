import type { DB } from "@/db";
import { schema } from "@/db";
import { DEFAULT_HOURS } from "./hours";
import { randomToken } from "./crypto";
import { STARTERS, starterFor } from "./starter-flows";

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

export const TRIAL_DAYS = 14;

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
    const starter = starterFor(industry);
    await tx.insert(schema.botFlows).values({ orgId: org.id, name: starter.name, status: "draft", trigger: starter.trigger, graph: starter.graph });
    return org;
  });
}

/** The general-purpose starter, used when the industry has no flow of its own. */
export function starterFlow() {
  return structuredClone(STARTERS.general.graph);
}
