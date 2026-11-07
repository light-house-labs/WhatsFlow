import { and, desc, eq, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { Plan } from "@/db/schema";
import { limitsFor, overLimit, PLANS, type Usage } from "./plans";

const PLAN_RANK: Record<Plan, number> = { trial: 0, starter: 1, team: 2, custom: 3 };

export async function usageFor(d: DB, orgId: string): Promise<Usage> {
  const [[seats], [flows], [numbers]] = await Promise.all([
    d.select({ n: sql<number>`count(*)` }).from(schema.memberships).where(eq(schema.memberships.orgId, orgId)),
    d.select({ n: sql<number>`count(*)` }).from(schema.botFlows).where(and(eq(schema.botFlows.orgId, orgId), eq(schema.botFlows.status, "live"))),
    d
      .select({ n: sql<number>`count(*)` })
      .from(schema.waNumbers)
      .where(and(eq(schema.waNumbers.orgId, orgId), eq(schema.waNumbers.provider, "cloud"), sql`${schema.waNumbers.status} <> 'disconnected'`)),
  ]);
  return { seats: Number(seats.n), liveFlows: Number(flows.n), numbers: Number(numbers.n) };
}

function periodEnd(from: Date, interval: "month" | "year") {
  const d = new Date(from);
  if (interval === "year") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export type ChangeResult =
  | { kind: "upgraded"; plan: Plan }
  | { kind: "downgrade_scheduled"; plan: Plan; at: Date; willPause: string[] }
  | { kind: "unchanged" };

/**
 * Upgrades apply now. Downgrades apply at the end of the paid period, and the
 * caller gets the exact list of what will be paused, to show before confirming.
 */
export async function changePlan(d: DB, orgId: string, actorId: string, plan: Plan, interval: "month" | "year"): Promise<ChangeResult> {
  const [org] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  if (!org) throw new Error("Workspace not found");
  if (org.plan === plan && org.planInterval === interval && org.billingStatus === "active" && !org.cancelAtPeriodEnd && !org.pendingPlan) return { kind: "unchanged" };
  const now = new Date();
  const isUpgrade = PLAN_RANK[plan] > PLAN_RANK[org.plan] || org.billingStatus !== "active";
  if (isUpgrade) {
    await d
      .update(schema.orgs)
      .set({ plan, planInterval: interval, billingStatus: "active", currentPeriodEnd: periodEnd(now, interval), cancelAtPeriodEnd: false, pendingPlan: null })
      .where(eq(schema.orgs.id, orgId));
    await d.insert(schema.billingEvents).values({ orgId, actorId, kind: "plan.changed", detail: { from: org.plan, to: plan, interval } });
    return { kind: "upgraded", plan };
  }
  const willPause = overLimit(plan, await usageFor(d, orgId));
  await d.update(schema.orgs).set({ pendingPlan: plan, cancelAtPeriodEnd: false }).where(eq(schema.orgs.id, orgId));
  await d.insert(schema.billingEvents).values({ orgId, actorId, kind: "downgrade.scheduled", detail: { from: org.plan, to: plan, at: org.currentPeriodEnd, willPause } });
  return { kind: "downgrade_scheduled", plan, at: org.currentPeriodEnd ?? now, willPause };
}

/** One click. Nothing more is charged; access continues to the end of what was paid for. */
export async function cancelSubscription(d: DB, orgId: string, actorId: string, reason: string | null) {
  const [org] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  if (!org) throw new Error("Workspace not found");
  if (org.billingStatus === "trialing") {
    await d.update(schema.orgs).set({ billingStatus: "cancelled", cancelAtPeriodEnd: false, pendingPlan: null }).where(eq(schema.orgs.id, orgId));
  } else {
    await d.update(schema.orgs).set({ cancelAtPeriodEnd: true, pendingPlan: null }).where(eq(schema.orgs.id, orgId));
  }
  await d.insert(schema.billingEvents).values({ orgId, actorId, kind: "subscription.cancelled", detail: { reason, endsAt: org.currentPeriodEnd } });
  return { endsAt: org.billingStatus === "trialing" ? new Date() : org.currentPeriodEnd };
}

export async function resumeSubscription(d: DB, orgId: string, actorId: string) {
  await d.update(schema.orgs).set({ cancelAtPeriodEnd: false }).where(eq(schema.orgs.id, orgId));
  await d.insert(schema.billingEvents).values({ orgId, actorId, kind: "subscription.resumed", detail: {} });
}

/** Apply period-end changes for every workspace that is due. Run from cron. */
export async function processPeriodEnds(d: DB, now = new Date()) {
  const due = await d
    .select()
    .from(schema.orgs)
    .where(and(lte(schema.orgs.currentPeriodEnd, now), or(eq(schema.orgs.billingStatus, "active"), eq(schema.orgs.billingStatus, "trialing"))));
  for (const org of due) {
    if (org.cancelAtPeriodEnd || org.billingStatus === "trialing") {
      await d.update(schema.orgs).set({ billingStatus: "cancelled", cancelAtPeriodEnd: false }).where(eq(schema.orgs.id, org.id));
      await d.insert(schema.billingEvents).values({ orgId: org.id, kind: org.billingStatus === "trialing" ? "trial.ended" : "subscription.ended", detail: {} });
      continue;
    }
    const plan = org.pendingPlan ?? org.plan;
    if (org.pendingPlan) await pauseOverLimit(d, org.id, plan);
    // Renewal. With a real provider this is where the charge is confirmed by webhook.
    await d
      .update(schema.orgs)
      .set({ plan, pendingPlan: null, currentPeriodEnd: periodEnd(org.currentPeriodEnd ?? now, org.planInterval) })
      .where(eq(schema.orgs.id, org.id));
    await d.insert(schema.billingEvents).values({ orgId: org.id, kind: "subscription.renewed", detail: { plan } });
  }
  return due.length;
}

/** Pause the newest live flows beyond the plan's limit, rather than charging for a bigger plan. */
export async function pauseOverLimit(d: DB, orgId: string, plan: Plan) {
  const limit = limitsFor(plan).botFlows;
  const live = await d
    .select({ id: schema.botFlows.id })
    .from(schema.botFlows)
    .where(and(eq(schema.botFlows.orgId, orgId), eq(schema.botFlows.status, "live")))
    .orderBy(desc(schema.botFlows.updatedAt));
  const extra = live.slice(0, Math.max(0, live.length - limit));
  for (const f of extra) await d.update(schema.botFlows).set({ status: "draft" }).where(eq(schema.botFlows.id, f.id));
  if (extra.length) await d.insert(schema.billingEvents).values({ orgId, kind: "flows.paused", detail: { count: extra.length, plan: PLANS[plan].name } });
  return extra.length;
}
