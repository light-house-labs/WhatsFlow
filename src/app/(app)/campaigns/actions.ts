"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, arrayOverlaps, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { enqueue, kickJobs } from "@/lib/jobs";
import { placeholderCount } from "@/lib/template-render";

export type CampaignState = { error?: string } | undefined;

export async function audienceSize(tags: string[], templateCategory: string): Promise<{ total: number; reachable: number }> {
  const ctx = await requireOrg();
  const where = [eq(schema.contacts.orgId, ctx.org.id)];
  if (tags.length) where.push(arrayOverlaps(schema.contacts.tags, tags));
  const [all] = await ctx.db.select({ n: sql<number>`count(*)` }).from(schema.contacts).where(and(...where));
  if (templateCategory !== "MARKETING") return { total: Number(all.n), reachable: Number(all.n) };
  const [ok] = await ctx.db.select({ n: sql<number>`count(*)` }).from(schema.contacts).where(and(...where, isNull(schema.contacts.optedOutAt)));
  return { total: Number(all.n), reachable: Number(ok.n) };
}

export async function createCampaign(_: CampaignState, form: FormData): Promise<CampaignState> {
  const ctx = await requireOrg("admin");
  const name = String(form.get("name") ?? "").trim();
  const templateId = String(form.get("templateId") ?? "");
  const numberId = String(form.get("numberId") ?? "");
  const tags = form.getAll("tags").map(String).filter(Boolean);
  const when = String(form.get("when") ?? "now");
  const at = String(form.get("scheduledAt") ?? "");
  if (ctx.org.billingStatus === "cancelled") return { error: "Your plan has ended. Choose a plan in Billing to send broadcasts." };
  if (!name) return { error: "Name the campaign so you can find it later." };
  const [tpl] = await ctx.db
    .select()
    .from(schema.templates)
    .where(and(eq(schema.templates.id, templateId), eq(schema.templates.orgId, ctx.org.id), eq(schema.templates.status, "approved")))
    .limit(1);
  if (!tpl) return { error: "Pick an approved template." };
  const [number] = await ctx.db.select().from(schema.waNumbers).where(and(eq(schema.waNumbers.id, numberId), eq(schema.waNumbers.orgId, ctx.org.id))).limit(1);
  if (!number || number.status !== "connected") return { error: "Pick a connected WhatsApp number." };
  const variableMap: Record<string, string> = {};
  for (let i = 1; i <= placeholderCount(tpl.body); i++) {
    const src = String(form.get(`var${i}`) ?? "");
    const literal = String(form.get(`var${i}Text`) ?? "");
    variableMap[String(i)] = src === "=" ? `=${literal}` : src;
    if (!variableMap[String(i)] || variableMap[String(i)] === "=") return { error: `Choose what goes in {{${i}}}.` };
  }
  const scheduledAt = when === "later" ? new Date(at) : null;
  if (when === "later" && (!at || Number.isNaN(scheduledAt!.getTime()) || scheduledAt! < new Date())) return { error: "Pick a time in the future." };
  const size = await audienceSize(tags, tpl.category);
  if (size.reachable === 0) return { error: "Nobody in this audience can receive it." };

  const [c] = await ctx.db
    .insert(schema.campaigns)
    .values({
      orgId: ctx.org.id,
      name,
      templateId: tpl.id,
      numberId: number.id,
      audience: tags.length ? { tags } : { all: true },
      variableMap,
      scheduledAt,
      status: "scheduled",
      createdBy: ctx.user.id,
    })
    .returning();
  await enqueue(ctx.db, "campaign.send", { campaignId: c.id }, scheduledAt ? scheduledAt.getTime() - Date.now() : 0);
  if (!scheduledAt) kickJobs(ctx.db);
  redirect(`/campaigns/${c.id}`);
}

export async function cancelCampaign(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  await ctx.db
    .update(schema.campaigns)
    .set({ status: "cancelled" })
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.org.id), sql`${schema.campaigns.status} in ('scheduled','sending')`));
  await ctx.db
    .update(schema.campaignRecipients)
    .set({ status: "skipped", error: "Campaign cancelled" })
    .where(and(eq(schema.campaignRecipients.campaignId, id), eq(schema.campaignRecipients.status, "pending")));
  revalidatePath(`/campaigns/${id}`);
}
