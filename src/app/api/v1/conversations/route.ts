import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { schema } from "@/db";
import { apiAuth } from "@/lib/api-auth";
import { conversationJson } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
  const where = [eq(schema.conversations.orgId, auth.orgId)];
  const status = url.searchParams.get("status");
  if (status === "open" || status === "pending" || status === "closed") where.push(eq(schema.conversations.status, status));
  const contactId = url.searchParams.get("contactId");
  if (contactId && /^[0-9a-f-]{36}$/.test(contactId)) where.push(eq(schema.conversations.contactId, contactId));
  const before = url.searchParams.get("before");
  if (before && !Number.isNaN(Date.parse(before))) where.push(lt(schema.conversations.lastMessageAt, new Date(before)));
  const rows = await auth.d.select().from(schema.conversations).where(and(...where)).orderBy(desc(schema.conversations.lastMessageAt)).limit(limit);
  return NextResponse.json({ data: rows.map(conversationJson), next: rows.length === limit ? rows[rows.length - 1].lastMessageAt.toISOString() : null });
}
