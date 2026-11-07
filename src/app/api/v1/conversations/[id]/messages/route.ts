import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { schema } from "@/db";
import { apiAuth, apiError } from "@/lib/api-auth";
import { messageJson, pageParams } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiAuth(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(404, "not_found", "No such conversation.");
  const [conv] = await auth.d.select({ id: schema.conversations.id }).from(schema.conversations).where(and(eq(schema.conversations.id, id), eq(schema.conversations.orgId, auth.orgId)));
  if (!conv) return apiError(404, "not_found", "No such conversation.");
  const { limit, before } = pageParams(new URL(req.url));
  const where = [eq(schema.messages.conversationId, conv.id)];
  if (before) where.push(lt(schema.messages.createdAt, before));
  const rows = await auth.d.select().from(schema.messages).where(and(...where)).orderBy(desc(schema.messages.createdAt)).limit(limit);
  return NextResponse.json({ data: rows.map(messageJson), next: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null });
}
