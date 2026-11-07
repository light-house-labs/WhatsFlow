import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";
import { toWaId } from "@/lib/phone";

export const dynamic = "force-dynamic";

/** What the customer's phone shows for a sandbox number. */
export async function GET(req: NextRequest) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const numberId = req.nextUrl.searchParams.get("numberId") ?? "";
  const waId = toWaId(req.nextUrl.searchParams.get("from") ?? "");
  if (!waId) return NextResponse.json({ messages: [] });
  const [row] = await ctx.db
    .select({ conv: schema.conversations })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(and(eq(schema.conversations.orgId, ctx.org.id), eq(schema.conversations.numberId, numberId), eq(schema.contacts.waId, waId)))
    .limit(1);
  if (!row) return NextResponse.json({ messages: [] });
  const messages = await ctx.db
    .select({ id: schema.messages.id, direction: schema.messages.direction, body: schema.messages.body, type: schema.messages.type, payload: schema.messages.payload, createdAt: schema.messages.createdAt, status: schema.messages.status })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, row.conv.id))
    .orderBy(asc(schema.messages.createdAt));
  return NextResponse.json({ messages: messages.filter((m) => m.direction === "in" || m.status !== "failed") });
}
