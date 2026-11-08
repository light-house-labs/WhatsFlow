import { NextResponse } from "next/server";
import { and, arrayContains, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { logged, apiAuth, apiError } from "@/lib/api-auth";
import { contactJson, pageParams } from "@/lib/api-v1";
import { emit } from "@/lib/events";
import { toWaId } from "@/lib/phone";

export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const auth = await apiAuth(req);
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const { limit, before } = pageParams(url);
  const where = [eq(schema.contacts.orgId, auth.orgId)];
  const tag = url.searchParams.get("tag");
  const q = url.searchParams.get("q");
  if (tag) where.push(arrayContains(schema.contacts.tags, [tag]));
  if (q) where.push(or(ilike(schema.contacts.name, `%${q}%`), ilike(schema.contacts.waId, `%${q.replace(/\D/g, "")}%`))!);
  if (before) where.push(lt(schema.contacts.createdAt, before));
  const rows = await auth.d.select().from(schema.contacts).where(and(...where)).orderBy(desc(schema.contacts.createdAt)).limit(limit);
  return NextResponse.json({ data: rows.map(contactJson), next: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null });
}

const Body = z.object({
  phone: z.string().min(6).max(20),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).optional(),
  customFields: z.record(z.string().max(60), z.string().max(500)).optional(),
});

/** Create or update a contact by phone number. */
async function handlePOST(req: Request) {
  const auth = await apiAuth(req, "full");
  if ("error" in auth) return auth.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid body");
  const waId = toWaId(parsed.data.phone);
  if (!waId) return apiError(400, "invalid_phone", "Use an international number, e.g. +919876543210.");
  const v = parsed.data;
  const [c] = await auth.d
    .insert(schema.contacts)
    .values({ orgId: auth.orgId, waId, name: v.name ?? null, email: v.email ?? null, tags: v.tags ?? [], customFields: v.customFields ?? {}, source: "api" })
    .onConflictDoUpdate({
      target: [schema.contacts.orgId, schema.contacts.waId],
      set: {
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.email !== undefined ? { email: v.email } : {}),
        ...(v.tags ? { tags: sql`array(select distinct unnest(${schema.contacts.tags} || ${v.tags}::text[]))` } : {}),
        ...(v.customFields ? { customFields: sql`${schema.contacts.customFields} || ${JSON.stringify(v.customFields)}::jsonb` } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.contacts.id, inserted: sql<boolean>`(xmax = 0)` });
  const [row] = await auth.d.select().from(schema.contacts).where(eq(schema.contacts.id, c.id));
  if (c.inserted) await emit(auth.d, auth.orgId, "contact.created", { contact: contactJson(row) });
  return NextResponse.json({ data: contactJson(row) }, { status: c.inserted ? 201 : 200 });
}

export const GET = logged(handleGET);
export const POST = logged(handlePOST);
