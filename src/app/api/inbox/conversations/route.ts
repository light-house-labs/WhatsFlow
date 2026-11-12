import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const filter = req.nextUrl.searchParams.get("filter") ?? "open";
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const label = req.nextUrl.searchParams.get("label");
  const c = schema.conversations;
  const where = [eq(c.orgId, ctx.org.id)];
  const [settings] = await ctx.db.select({ wait: schema.inboxSettings.waitAlertMinutes }).from(schema.inboxSettings).where(eq(schema.inboxSettings.orgId, ctx.org.id));
  const waitAlertMinutes = settings?.wait ?? 15;
  if (filter === "mine") where.push(eq(c.assigneeId, ctx.user.id), ne(c.status, "closed"));
  else if (filter === "unassigned") where.push(isNull(c.assigneeId), ne(c.status, "closed"), eq(c.handledBy, "human"));
  else if (filter === "bot") where.push(eq(c.handledBy, "bot"), ne(c.status, "closed"));
  else if (filter === "closed") where.push(eq(c.status, "closed"));
  // Customer waiting on a person for longer than the workspace's alert threshold.
  else if (filter === "overdue")
    where.push(ne(c.status, "closed"), eq(c.handledBy, "human"), sql`${c.waitingSince} < now() - make_interval(mins => ${waitAlertMinutes})`);
  // An enquiry on this chat still needs a person.
  else if (filter === "enquiries")
    where.push(ne(c.status, "closed"), sql`exists (select 1 from enquiries e where e.conversation_id = ${c.id} and e.status = 'needs_human')`);
  else where.push(ne(c.status, "closed"));
  if (label) where.push(sql`${label} = any(${c.labels})`);
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(schema.contacts.name, like), ilike(schema.contacts.waId, like), ilike(c.lastMessagePreview, like))!);
  }
  const rows = await ctx.db
    .select({
      id: c.id,
      status: c.status,
      handledBy: c.handledBy,
      labels: c.labels,
      unread: c.unreadCount,
      preview: c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
      waitingSince: c.waitingSince,
      lastInboundAt: c.lastInboundAt,
      assigneeId: c.assigneeId,
      contactName: schema.contacts.name,
      contactWaId: schema.contacts.waId,
    })
    .from(c)
    .innerJoin(schema.contacts, eq(schema.contacts.id, c.contactId))
    .where(and(...where))
    .orderBy(desc(c.lastMessageAt))
    .limit(200);
  return NextResponse.json({ conversations: rows, waitAlertMinutes });
}
