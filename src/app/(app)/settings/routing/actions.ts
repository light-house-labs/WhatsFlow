"use server";

import { revalidatePath } from "next/cache";

import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { LANGUAGES } from "@/lib/routing";

export async function addRule(form: FormData): Promise<{ error: string } | undefined> {
  const ctx = await requireOrg("admin");
  const match = form.get("match") === "language" ? "language" : "keyword";
  const values =
    match === "language"
      ? form.getAll("languages").map(String).filter((l) => l in LANGUAGES)
      : String(form.get("keywords") ?? "")
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 30);
  if (!values.length) return { error: match === "language" ? "Pick at least one language." : "Add at least one keyword." };
  const assignTo = String(form.get("assignTo") ?? "");
  const assignMode = assignTo === "least_busy" ? "least_busy" : assignTo ? "user" : "none";
  if (assignMode === "user") {
    const [m] = await ctx.db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, assignTo))).limit(1);
    if (!m) return { error: "That person isn't in this workspace." };
  }
  const label = String(form.get("label") ?? "").trim().toLowerCase().slice(0, 30) || null;
  if (assignMode === "none" && !label) return { error: "Choose who gets these chats, or a label." };
  const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)` }).from(schema.routingRules).where(eq(schema.routingRules.orgId, ctx.org.id));
  await ctx.db.insert(schema.routingRules).values({ orgId: ctx.org.id, position: Number(n), match, values, assignMode, assigneeId: assignMode === "user" ? assignTo : null, label });
  await audit(ctx, "routing.created", values.join(", "), { match, assignMode, label });
  revalidatePath("/settings/routing");
}

export async function toggleRule(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  await ctx.db.update(schema.routingRules).set({ active: form.get("active") === "1" }).where(and(eq(schema.routingRules.id, id), eq(schema.routingRules.orgId, ctx.org.id)));
  await audit(ctx, "routing.toggled", id, { active: form.get("active") === "1" });
  revalidatePath("/settings/routing");
}

export async function deleteRule(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  await ctx.db.delete(schema.routingRules).where(and(eq(schema.routingRules.id, id), eq(schema.routingRules.orgId, ctx.org.id)));
  await audit(ctx, "routing.deleted", id);
  revalidatePath("/settings/routing");
}
