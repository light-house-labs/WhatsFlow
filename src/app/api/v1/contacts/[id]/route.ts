import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { logged, apiAuth, apiError } from "@/lib/api-auth";
import { contactJson } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

async function handleGET(req: Request, { params }: Ctx) {
  const auth = await apiAuth(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError(404, "not_found", "No such contact.");
  const [c] = await auth.d.select().from(schema.contacts).where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, auth.orgId)));
  if (!c) return apiError(404, "not_found", "No such contact.");
  return NextResponse.json({ data: contactJson(c) });
}

const Patch = z.object({
  name: z.string().max(120).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  addTags: z.array(z.string().min(1).max(40)).max(50).optional(),
  removeTags: z.array(z.string().min(1).max(40)).max(50).optional(),
  customFields: z.record(z.string().max(60), z.string().max(500)).optional(),
});

async function handlePATCH(req: Request, { params }: Ctx) {
  const auth = await apiAuth(req, "full");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return apiError(404, "not_found", "No such contact.");
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid body");
  const v = parsed.data;
  const [c] = await auth.d
    .update(schema.contacts)
    .set({
      ...(v.name !== undefined ? { name: v.name } : {}),
      ...(v.email !== undefined ? { email: v.email } : {}),
      ...(v.addTags || v.removeTags
        ? { tags: sql`array(select distinct t from unnest(${schema.contacts.tags} || ${v.addTags ?? []}::text[]) t where t <> all(${v.removeTags ?? []}::text[]))` }
        : {}),
      ...(v.customFields ? { customFields: sql`${schema.contacts.customFields} || ${JSON.stringify(v.customFields)}::jsonb` } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, auth.orgId)))
    .returning();
  if (!c) return apiError(404, "not_found", "No such contact.");
  return NextResponse.json({ data: contactJson(c) });
}

export const GET = logged(handleGET);
export const PATCH = logged(handlePATCH);
