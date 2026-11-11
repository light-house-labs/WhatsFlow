"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { toWaId } from "@/lib/phone";

const tagList = (s: string) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);

export async function createContact(form: FormData): Promise<{ error: string } | undefined> {
  const ctx = await requireOrg();
  const waId = toWaId(String(form.get("phone") ?? ""));
  if (!waId) return { error: "That doesn't look like a phone number." };
  const [c] = await ctx.db
    .insert(schema.contacts)
    .values({ orgId: ctx.org.id, waId, name: String(form.get("name") ?? "").trim() || null, tags: tagList(String(form.get("tags") ?? "")), source: "manual" })
    .onConflictDoNothing()
    .returning();
  if (!c) return { error: "A contact with that number already exists." };
  redirect(`/contacts/${c.id}`);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120),
  email: z.string().trim().max(200),
  tags: z.string(),
  notes: z.string().max(5000),
  ownerId: z.string(),
  fieldKeys: z.array(z.string()),
  fieldValues: z.array(z.string()),
});

export async function updateContact(form: FormData) {
  const ctx = await requireOrg();
  const v = updateSchema.parse({
    id: form.get("id"),
    name: form.get("name") ?? "",
    email: form.get("email") ?? "",
    tags: form.get("tags") ?? "",
    notes: form.get("notes") ?? "",
    ownerId: form.get("ownerId") ?? "",
    fieldKeys: form.getAll("fieldKey").map(String),
    fieldValues: form.getAll("fieldValue").map(String),
  });
  const customFields: Record<string, string> = {};
  v.fieldKeys.forEach((k, i) => {
    const key = k.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (key && v.fieldValues[i]?.trim()) customFields[key] = v.fieldValues[i].trim();
  });
  await ctx.db
    .update(schema.contacts)
    .set({
      name: v.name || null,
      email: v.email || null,
      tags: tagList(v.tags),
      notes: v.notes || null,
      ownerId: v.ownerId || null,
      customFields,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.contacts.id, v.id), eq(schema.contacts.orgId, ctx.org.id)));
  revalidatePath(`/contacts/${v.id}`);
}

export async function setOptOut(form: FormData) {
  const ctx = await requireOrg();
  const id = String(form.get("id"));
  const out = form.get("optOut") === "1";
  await ctx.db
    .update(schema.contacts)
    .set({ optedOutAt: out ? new Date() : null })
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, ctx.org.id)));
  revalidatePath(`/contacts/${id}`);
}

export async function deleteContact(form: FormData) {
  const ctx = await requireOrg("admin");
  const id = String(form.get("id"));
  await ctx.db.delete(schema.contacts).where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, ctx.org.id)));
  redirect("/contacts?deleted=1");
}

export async function bulkTag(form: FormData) {
  const ctx = await requireOrg();
  const ids = form.getAll("ids").map(String);
  const tags = tagList(String(form.get("tag") ?? ""));
  if (ids.length && tags.length) {
    for (const id of ids) {
      await ctx.db
        .update(schema.contacts)
        .set({ tags: sql`array(select distinct unnest(${schema.contacts.tags} || ${tags}::text[]))` })
        .where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, ctx.org.id)));
    }
  }
  revalidatePath("/contacts");
}

export type ImportRow = { phone: string; name?: string; email?: string; tags?: string; [k: string]: string | undefined };
export type ImportResult = { created: number; updated: number; skipped: { row: number; reason: string }[] };

/** Import parsed CSV rows. Existing contacts (same number) are updated, never duplicated. */
export async function importContacts(rows: ImportRow[], extraTag: string): Promise<ImportResult> {
  const ctx = await requireOrg();
  const result: ImportResult = { created: 0, updated: 0, skipped: [] };
  const base = tagList(extraTag);
  for (let i = 0; i < Math.min(rows.length, 10_000); i++) {
    const r = rows[i];
    const waId = toWaId(r.phone ?? "");
    if (!waId) {
      result.skipped.push({ row: i + 2, reason: `“${r.phone ?? ""}” isn't a phone number` });
      continue;
    }
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) if (!["phone", "name", "email", "tags"].includes(k) && v?.trim()) custom[k] = v.trim();
    const tags = [...new Set([...base, ...tagList(r.tags ?? "")])];
    const [existing] = await ctx.db
      .select({ id: schema.contacts.id, tags: schema.contacts.tags, customFields: schema.contacts.customFields })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.orgId, ctx.org.id), eq(schema.contacts.waId, waId)))
      .limit(1);
    if (existing) {
      await ctx.db
        .update(schema.contacts)
        .set({
          ...(r.name?.trim() ? { name: r.name.trim() } : {}),
          ...(r.email?.trim() ? { email: r.email.trim() } : {}),
          tags: [...new Set([...existing.tags, ...tags])],
          customFields: { ...existing.customFields, ...custom },
          updatedAt: new Date(),
        })
        .where(eq(schema.contacts.id, existing.id));
      result.updated++;
    } else {
      await ctx.db.insert(schema.contacts).values({
        orgId: ctx.org.id,
        waId,
        name: r.name?.trim() || null,
        email: r.email?.trim() || null,
        tags,
        customFields: custom,
        source: "import",
      });
      result.created++;
    }
  }
  revalidatePath("/contacts");
  return result;
}
