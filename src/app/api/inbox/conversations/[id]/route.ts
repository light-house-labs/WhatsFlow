import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";
import { windowOpen } from "@/lib/wa/outbound";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await orgOrNull();
  if (!ctx) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await params;
  const [row] = await ctx.db
    .select({ conv: schema.conversations, contact: schema.contacts, number: schema.waNumbers })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .innerJoin(schema.waNumbers, eq(schema.waNumbers.id, schema.conversations.numberId))
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.orgId, ctx.org.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [messages, notes, leads, tickets] = await Promise.all([
    ctx.db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.createdAt)).limit(500),
    ctx.db.select().from(schema.notes).where(eq(schema.notes.conversationId, id)).orderBy(asc(schema.notes.createdAt)),
    ctx.db.select({ id: schema.leads.id, title: schema.leads.title, stageId: schema.leads.stageId }).from(schema.leads).where(eq(schema.leads.contactId, row.contact.id)).orderBy(desc(schema.leads.createdAt)).limit(5),
    ctx.db.select({ id: schema.tickets.id, number: schema.tickets.number, subject: schema.tickets.subject, status: schema.tickets.status }).from(schema.tickets).where(eq(schema.tickets.contactId, row.contact.id)).orderBy(desc(schema.tickets.createdAt)).limit(5),
  ]);
  return NextResponse.json({
    conversation: row.conv,
    contact: row.contact,
    number: { id: row.number.id, displayPhone: row.number.displayPhone, provider: row.number.provider },
    windowOpen: windowOpen(row.conv.lastInboundAt),
    messages,
    notes,
    leads,
    tickets,
  });
}
