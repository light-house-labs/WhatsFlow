"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { countSegment, RulesSchema, segmentWhere } from "@/lib/segments";

export type SegmentState = { error?: string } | undefined;

function parseRules(raw: unknown) {
  let json: unknown = null;
  try {
    json = JSON.parse(String(raw ?? ""));
  } catch {}
  return RulesSchema.safeParse(json);
}

/** Live count and a few example contacts while the segment is being built. */
export async function previewSegment(rulesJson: string): Promise<{ error?: string; count?: number; sample?: { id: string; name: string | null; waId: string }[] }> {
  const ctx = await requireOrg();
  const parsed = parseRules(rulesJson);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Finish the conditions." };
  const [count, sample] = await Promise.all([
    countSegment(ctx.db, ctx.org.id, parsed.data),
    ctx.db
      .select({ id: schema.contacts.id, name: schema.contacts.name, waId: schema.contacts.waId })
      .from(schema.contacts)
      .where(segmentWhere(ctx.org.id, parsed.data))
      .orderBy(desc(schema.contacts.lastInboundAt))
      .limit(5),
  ]);
  return { count, sample };
}

export async function saveSegment(_: SegmentState, form: FormData): Promise<SegmentState> {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Name the segment." };
  const parsed = parseRules(form.get("rules"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Finish the conditions." };
  if (id) {
    const [row] = await ctx.db
      .update(schema.segments)
      .set({ name, rules: parsed.data, updatedAt: new Date() })
      .where(and(eq(schema.segments.id, id), eq(schema.segments.orgId, ctx.org.id)))
      .returning({ id: schema.segments.id });
    if (!row) return { error: "That segment no longer exists." };
  } else {
    await ctx.db.insert(schema.segments).values({ orgId: ctx.org.id, name, rules: parsed.data });
  }
  await audit(ctx, "segment.saved", name);
  revalidatePath("/contacts/segments");
  redirect("/contacts/segments?saved=1");
}

export async function deleteSegment(form: FormData) {
  const ctx = await requireOrg("admin");
  const [gone] = await ctx.db
    .delete(schema.segments)
    .where(and(eq(schema.segments.id, String(form.get("id"))), eq(schema.segments.orgId, ctx.org.id)))
    .returning({ name: schema.segments.name });
  if (gone) await audit(ctx, "segment.deleted", gone.name);
  revalidatePath("/contacts/segments");
  redirect("/contacts/segments");
}
