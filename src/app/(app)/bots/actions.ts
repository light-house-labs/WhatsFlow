"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { FlowEdge, FlowNode, FlowTrigger } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { validateGraph } from "@/lib/flows/graph";
import { limitsFor } from "@/lib/plans";

export async function createFlow() {
  const ctx = await requireOrg("admin");
  const [f] = await ctx.db
    .insert(schema.botFlows)
    .values({
      orgId: ctx.org.id,
      name: "Untitled flow",
      trigger: { kind: "keyword", keywords: [] },
      graph: {
        nodes: [
          { id: "t", type: "trigger", position: { x: 40, y: 120 }, data: {} },
          { id: "m1", type: "message", position: { x: 320, y: 120 }, data: { text: "Hi! How can we help?" } },
        ],
        edges: [{ id: "e1", source: "t", target: "m1" }],
      },
    })
    .returning();
  redirect(`/bots/${f.id}`);
}

export type SaveResult = { ok: boolean; problems: string[]; status?: "draft" | "live" };

export async function saveFlow(
  id: string,
  input: { name: string; trigger: FlowTrigger; nodes: FlowNode[]; edges: FlowEdge[] },
  publish: "keep" | "live" | "draft",
): Promise<SaveResult> {
  const ctx = await requireOrg("admin");
  const [flow] = await ctx.db.select().from(schema.botFlows).where(and(eq(schema.botFlows.id, id), eq(schema.botFlows.orgId, ctx.org.id))).limit(1);
  if (!flow) return { ok: false, problems: ["Flow not found."] };
  const graph = { nodes: input.nodes, edges: input.edges };
  const nextStatus = publish === "keep" ? flow.status : publish;
  const problems = nextStatus === "live" ? validateGraph(graph) : [];
  if (nextStatus === "live") {
    if (input.trigger.kind === "keyword" && input.trigger.keywords.filter((k) => k.trim()).length === 0) problems.push("Add at least one keyword that starts this flow.");
    const [live] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.botFlows)
      .where(and(eq(schema.botFlows.orgId, ctx.org.id), eq(schema.botFlows.status, "live"), ne(schema.botFlows.id, id)));
    const limit = limitsFor(ctx.org.plan).botFlows;
    if (Number(live.n) + 1 > limit) problems.push(`Your plan allows ${limit} live flows. Pause another flow or upgrade.`);
  }
  if (problems.length) {
    // save the work anyway, but don't go live with a broken flow
    await ctx.db.update(schema.botFlows).set({ name: input.name, trigger: input.trigger, graph, updatedAt: new Date() }).where(eq(schema.botFlows.id, id));
    return { ok: false, problems, status: flow.status };
  }
  await ctx.db
    .update(schema.botFlows)
    .set({ name: input.name.trim() || "Untitled flow", trigger: input.trigger, graph, status: nextStatus, updatedAt: new Date() })
    .where(eq(schema.botFlows.id, id));
  revalidatePath("/bots");
  return { ok: true, problems: [], status: nextStatus };
}

export async function toggleFlow(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  const [flow] = await ctx.db.select().from(schema.botFlows).where(and(eq(schema.botFlows.id, id), eq(schema.botFlows.orgId, ctx.org.id))).limit(1);
  if (!flow) return;
  if (flow.status === "live") {
    await ctx.db.update(schema.botFlows).set({ status: "draft" }).where(eq(schema.botFlows.id, id));
  } else {
    const r = await saveFlow(id, { name: flow.name, trigger: flow.trigger, nodes: flow.graph.nodes, edges: flow.graph.edges }, "live");
    if (!r.ok) redirect(`/bots/${id}?problems=1`);
  }
  revalidatePath("/bots");
}

export async function deleteFlow(form: FormData) {
  const ctx = await requireOrg("admin");
  await ctx.db.delete(schema.botFlows).where(and(eq(schema.botFlows.id, String(form.get("id"))), eq(schema.botFlows.orgId, ctx.org.id)));
  redirect("/bots");
}
