"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { startAutomations } from "@/lib/events";
import { kickJobs } from "@/lib/jobs";

export async function moveLead(leadId: string, stageId: string) {
  const ctx = await requireOrg();
  const [stage] = await ctx.db.select().from(schema.pipelineStages).where(and(eq(schema.pipelineStages.id, stageId), eq(schema.pipelineStages.orgId, ctx.org.id))).limit(1);
  if (!stage) return;
  const [lead] = await ctx.db
    .update(schema.leads)
    .set({ stageId, closedAt: stage.kind === "open" ? null : new Date(), updatedAt: new Date() })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.org.id)))
    .returning();
  if (lead && stage.kind === "won") {
    await startAutomations(ctx.db, ctx.org.id, "lead_won", { contactId: lead.contactId, conversationId: lead.conversationId, key: `lead-won:${lead.id}` });
    kickJobs(ctx.db);
  }
  revalidatePath("/pipeline");
}

export async function updateLead(form: FormData) {
  const ctx = await requireOrg();
  const id = String(form.get("id"));
  const value = Number(String(form.get("value") ?? "0").replace(/[^\d.]/g, "")) || 0;
  const follow = String(form.get("nextFollowUpAt") ?? "");
  await ctx.db
    .update(schema.leads)
    .set({
      title: String(form.get("title") ?? "").trim() || "Lead",
      valueMinor: Math.round(value * 100),
      ownerId: String(form.get("ownerId") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
      nextFollowUpAt: follow ? new Date(follow) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.leads.id, id), eq(schema.leads.orgId, ctx.org.id)));
  revalidatePath("/pipeline");
}

export async function deleteLead(form: FormData) {
  const ctx = await requireOrg();
  await ctx.db.delete(schema.leads).where(and(eq(schema.leads.id, String(form.get("id"))), eq(schema.leads.orgId, ctx.org.id)));
  revalidatePath("/pipeline");
}

export async function addStage(form: FormData) {
  const ctx = await requireOrg("admin");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const [m] = await ctx.db.select({ p: sql<number>`coalesce(max(position), -1)` }).from(schema.pipelineStages).where(eq(schema.pipelineStages.orgId, ctx.org.id));
  await ctx.db.insert(schema.pipelineStages).values({ orgId: ctx.org.id, name, position: Number(m.p) + 1, kind: (String(form.get("kind")) as "open") || "open" });
  revalidatePath("/pipeline");
}

export async function renameStage(form: FormData) {
  const ctx = await requireOrg("admin");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await ctx.db.update(schema.pipelineStages).set({ name }).where(and(eq(schema.pipelineStages.id, String(form.get("id"))), eq(schema.pipelineStages.orgId, ctx.org.id)));
  revalidatePath("/pipeline");
}

export async function deleteStage(form: FormData): Promise<void> {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  const [used] = await ctx.db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(eq(schema.leads.stageId, id));
  if (Number(used.n) > 0) return; // UI explains: move the leads first
  await ctx.db.delete(schema.pipelineStages).where(and(eq(schema.pipelineStages.id, id), eq(schema.pipelineStages.orgId, ctx.org.id)));
  revalidatePath("/pipeline");
}
