import { NextResponse } from "next/server";
import Papa from "papaparse";
import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { orgOrNull } from "@/lib/auth";

export const dynamic = "force-dynamic";

const KINDS = ["contacts", "messages", "leads", "tickets", "orders", "appointments", "all"] as const;
type Kind = (typeof KINDS)[number];

/** Data export for owners and admins. CSV per table, or everything as one JSON file. */
export async function GET(req: Request) {
  const ctx = await orgOrNull("admin");
  if (!ctx) return new NextResponse("Only owners and admins can export.", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") as Kind;
  if (!KINDS.includes(kind)) return new NextResponse("Unknown export", { status: 400 });
  const d = ctx.db;
  const o = ctx.org.id;

  const contacts = async () =>
    (await d.select().from(schema.contacts).where(eq(schema.contacts.orgId, o)).orderBy(asc(schema.contacts.createdAt))).map((c) => ({
      id: c.id,
      phone: `+${c.waId}`,
      name: c.name ?? "",
      email: c.email ?? "",
      tags: c.tags.join(";"),
      custom_fields: JSON.stringify(c.customFields),
      source: c.source,
      opted_out_at: c.optedOutAt?.toISOString() ?? "",
      created_at: c.createdAt.toISOString(),
    }));
  const messages = async () =>
    (
      await d
        .select({ m: schema.messages, phone: schema.contacts.waId })
        .from(schema.messages)
        .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
        .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
        .where(eq(schema.messages.orgId, o))
        .orderBy(asc(schema.messages.createdAt))
    ).map(({ m, phone }) => ({
      conversation_id: m.conversationId,
      customer_phone: `+${phone}`,
      direction: m.direction,
      sender: m.senderKind,
      type: m.type,
      text: m.body ?? "",
      status: m.status,
      at: m.createdAt.toISOString(),
    }));
  const leads = async () =>
    (
      await d
        .select({ l: schema.leads, stage: schema.pipelineStages.name, phone: schema.contacts.waId })
        .from(schema.leads)
        .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.leads.stageId))
        .innerJoin(schema.contacts, eq(schema.contacts.id, schema.leads.contactId))
        .where(eq(schema.leads.orgId, o))
    ).map(({ l, stage, phone }) => ({ id: l.id, title: l.title, stage, value: l.valueMinor / 100, currency: l.currency, customer_phone: `+${phone}`, source: l.source, notes: l.notes ?? "", created_at: l.createdAt.toISOString() }));
  const tickets = async () =>
    (await d.select().from(schema.tickets).where(eq(schema.tickets.orgId, o))).map((t) => ({
      number: t.number,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      description: t.description ?? "",
      created_at: t.createdAt.toISOString(),
      resolved_at: t.resolvedAt?.toISOString() ?? "",
    }));
  const orders = async () =>
    (await d.select().from(schema.orders).where(eq(schema.orders.orgId, o))).map((x) => ({
      number: x.number,
      items: x.items.map((i) => `${i.qty} x ${i.name}`).join("; "),
      total: x.totalMinor / 100,
      currency: x.currency,
      status: x.status,
      payment_status: x.paymentStatus,
      paid_at: x.paidAt?.toISOString() ?? "",
      created_at: x.createdAt.toISOString(),
    }));
  const appointments = async () =>
    (
      await d
        .select({ a: schema.appointments, service: schema.services.name, phone: schema.contacts.waId })
        .from(schema.appointments)
        .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
        .innerJoin(schema.contacts, eq(schema.contacts.id, schema.appointments.contactId))
        .where(eq(schema.appointments.orgId, o))
    ).map(({ a, service, phone }) => ({ service, customer_phone: `+${phone}`, start: a.startAt.toISOString(), end: a.endAt.toISOString(), status: a.status, notes: a.notes ?? "" }));

  const all = { contacts, messages, leads, tickets, orders, appointments };
  await d.insert(schema.auditLog).values({ orgId: o, actorId: ctx.user.id, action: "data.exported", target: kind });
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === "all") {
    const out: Record<string, unknown> = { workspace: { id: o, name: ctx.org.name, exportedAt: new Date().toISOString() } };
    for (const [k, fn] of Object.entries(all)) out[k] = await fn();
    const products = await d.select().from(schema.products).where(eq(schema.products.orgId, o));
    const templates = await d.select().from(schema.templates).where(eq(schema.templates.orgId, o));
    const flows = await d.select().from(schema.botFlows).where(eq(schema.botFlows.orgId, o));
    Object.assign(out, { products, templates, botFlows: flows });
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="whatsflow-${stamp}.json"` },
    });
  }
  const rows: Record<string, unknown>[] = await all[kind]();
  // A leading "=", "+", "-" or "@" makes spreadsheets run the cell as a formula.
  const csv = Papa.unparse(rows, { escapeFormulae: true });
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="whatsflow-${kind}-${stamp}.csv"` },
  });
}
