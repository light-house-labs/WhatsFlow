import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { cancelSubscription, changePlan, processPeriodEnds } from "@/lib/billing";
import { makeOrg } from "./helpers";
import { limitsFor, ofLimit } from "@/lib/plans";

describe("billing", () => {
  // These cover the hosted product's plans; self-hosted installs run with billing off.
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_BILLING", "on"));
  afterEach(() => vi.unstubAllEnvs());

  it("cancel during trial ends access now and never schedules a charge", async () => {
    const { d, org, user } = await makeOrg();
    await cancelSubscription(d, org.id, user.id, "too expensive");
    const [o] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, org.id));
    expect(o.billingStatus).toBe("cancelled");
    const ev = await d.select().from(schema.billingEvents).where(eq(schema.billingEvents.orgId, org.id));
    expect(ev.map((e) => e.kind)).toContain("subscription.cancelled");
  });

  it("cancel on a paid plan keeps access until period end, then ends instead of renewing", async () => {
    const { d, org, user } = await makeOrg();
    await changePlan(d, org.id, user.id, "team", "month");
    await cancelSubscription(d, org.id, user.id, null);
    let [o] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, org.id));
    expect(o.billingStatus).toBe("active");
    expect(o.cancelAtPeriodEnd).toBe(true);
    await processPeriodEnds(d, new Date(o.currentPeriodEnd!.getTime() + 1000));
    [o] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, org.id));
    expect(o.billingStatus).toBe("cancelled");
    const ev = await d.select().from(schema.billingEvents).where(eq(schema.billingEvents.orgId, org.id));
    expect(ev.map((e) => e.kind)).not.toContain("subscription.renewed");
  });

  it("downgrade lists what will be paused and pauses it at period end", async () => {
    const { d, org, user } = await makeOrg();
    await changePlan(d, org.id, user.id, "team", "month");
    const flows = Array.from({ length: 7 }, (_, i) => ({
      orgId: org.id,
      name: `f${i}`,
      status: "live" as const,
      trigger: { kind: "keyword" as const, keywords: [`k${i}`] },
      graph: { nodes: [], edges: [] },
    }));
    await d.insert(schema.botFlows).values(flows);
    const r = await changePlan(d, org.id, user.id, "starter", "month");
    expect(r.kind).toBe("downgrade_scheduled");
    if (r.kind === "downgrade_scheduled") expect(r.willPause.join(" ")).toMatch(/2 live bot flow/);
    const [o] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, org.id));
    await processPeriodEnds(d, new Date(o.currentPeriodEnd!.getTime() + 1000));
    const live = await d.select().from(schema.botFlows).where(eq(schema.botFlows.orgId, org.id));
    expect(live.filter((f) => f.status === "live")).toHaveLength(5);
    const [after] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, org.id));
    expect(after.plan).toBe("starter");
    expect(after.billingStatus).toBe("active");
  });
});

describe("without billing (open source default)", () => {
  it("gives new workspaces every feature with no trial and no caps", async () => {
    const { d, org } = await makeOrg();
    expect(org.billingStatus).toBe("active");
    expect(org.currentPeriodEnd).toBeNull();
    expect(limitsFor(org.plan).seats).toBe(Infinity);
    expect(ofLimit(3, Infinity)).toBe("3");
    expect(ofLimit(3, 10)).toBe("3 of 10");
    // a workspace a trial had closed while billing was on is reopened
    await d.update(schema.orgs).set({ billingStatus: "cancelled", currentPeriodEnd: new Date(0) }).where(eq(schema.orgs.id, org.id));
    await processPeriodEnds(d);
    const [o] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, org.id));
    expect(o.billingStatus).toBe("active");
    expect(o.currentPeriodEnd).toBeNull();
  });
});
