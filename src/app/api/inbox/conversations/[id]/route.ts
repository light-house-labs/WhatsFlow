import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";
import { windowOpen } from "@/lib/wa/outbound";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const typing = new URL(req.url).searchParams.get("typing") === "1";
  await ctx.db
    .insert(schema.presence)
    .values({ conversationId: id, userId: ctx.user.id, typing, seenAt: new Date() })
    .onConflictDoUpdate({ target: [schema.presence.conversationId, schema.presence.userId], set: { typing, seenAt: new Date() } });
  const [messages, notes, leads, tickets, orders, [appointment], viewers] = await Promise.all([
    ctx.db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.createdAt)).limit(500),
    ctx.db.select().from(schema.notes).where(eq(schema.notes.conversationId, id)).orderBy(asc(schema.notes.createdAt)),
    ctx.db.select({ id: schema.leads.id, title: schema.leads.title, stageId: schema.leads.stageId }).from(schema.leads).where(eq(schema.leads.contactId, row.contact.id)).orderBy(desc(schema.leads.createdAt)).limit(5),
    ctx.db.select({ id: schema.tickets.id, number: schema.tickets.number, subject: schema.tickets.subject, status: schema.tickets.status }).from(schema.tickets).where(eq(schema.tickets.contactId, row.contact.id)).orderBy(desc(schema.tickets.createdAt)).limit(5),
    ctx.db
      .select({ id: schema.orders.id, number: schema.orders.number, totalMinor: schema.orders.totalMinor, currency: schema.orders.currency, status: schema.orders.status, paymentStatus: schema.orders.paymentStatus })
      .from(schema.orders)
      .where(eq(schema.orders.contactId, row.contact.id))
      .orderBy(desc(schema.orders.createdAt))
      .limit(5),
    ctx.db
      .select({ startAt: schema.appointments.startAt, service: schema.services.name })
      .from(schema.appointments)
      .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
      .where(and(eq(schema.appointments.contactId, row.contact.id), eq(schema.appointments.status, "booked"), gt(schema.appointments.startAt, new Date())))
      .orderBy(asc(schema.appointments.startAt))
      .limit(1),
    ctx.db
      .select({ name: schema.users.name, typing: schema.presence.typing })
      .from(schema.presence)
      .innerJoin(schema.users, eq(schema.users.id, schema.presence.userId))
      .where(and(eq(schema.presence.conversationId, id), ne(schema.presence.userId, ctx.user.id), gt(schema.presence.seenAt, new Date(Date.now() - 10_000)))),
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
    orders,
    appointment: appointment ?? null,
    viewers,
  });
}
