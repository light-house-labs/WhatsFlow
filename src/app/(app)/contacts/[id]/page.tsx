import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { dateTime } from "@/lib/format";
import { formatMoney } from "@/lib/plans";
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { deleteContact, setOptOut, updateContact } from "../actions";

export const metadata = { title: "Contact" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org, role } = await requireOrg();
  const [contact] = await d.select().from(schema.contacts).where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, org.id))).limit(1);
  if (!contact) notFound();
  const [orders, appointments] = await Promise.all([
    d.select().from(schema.orders).where(and(eq(schema.orders.contactId, id), eq(schema.orders.orgId, org.id))).orderBy(desc(schema.orders.createdAt)).limit(20),
    d
      .select({ a: schema.appointments, service: schema.services.name })
      .from(schema.appointments)
      .innerJoin(schema.services, eq(schema.services.id, schema.appointments.serviceId))
      .where(and(eq(schema.appointments.contactId, id), eq(schema.appointments.orgId, org.id)))
      .orderBy(desc(schema.appointments.startAt))
      .limit(10),
  ]);
  const [members, convs, leads, tickets, enquiries] = await Promise.all([
    d.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id)),
    d.select().from(schema.conversations).where(eq(schema.conversations.contactId, id)),
    d.select({ lead: schema.leads, stage: schema.pipelineStages.name }).from(schema.leads).innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.leads.stageId)).where(eq(schema.leads.contactId, id)).orderBy(desc(schema.leads.createdAt)),
    d.select().from(schema.tickets).where(eq(schema.tickets.contactId, id)).orderBy(desc(schema.tickets.createdAt)),
    d.select().from(schema.enquiries).where(eq(schema.enquiries.contactId, id)).orderBy(desc(schema.enquiries.createdAt)).limit(20),
  ]);
  const timeline = [
    ...enquiries.map((e) => ({ at: e.createdAt, text: `Enquiry: “${e.topic}”`, status: e.status })),
    ...leads.map((l) => ({ at: l.lead.createdAt, text: `Lead created: ${l.lead.title} (${l.stage})`, status: null })),
    ...tickets.map((t) => ({ at: t.createdAt, text: `Ticket #${t.number}: ${t.subject}`, status: t.status })),
    { at: contact.createdAt, text: `Contact added from ${contact.source}`, status: null },
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const fields = Object.entries(contact.customFields);
  return (
    <>
      <PageHeader
        title={contact.name ?? formatWaId(contact.waId)}
        description={formatWaId(contact.waId)}
        actions={convs[0] && <ButtonLink href={`/inbox?c=${convs[0].id}`}>Open chat</ButtonLink>}
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <form action={updateContact} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={contact.id} />
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={contact.name ?? ""} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} />
            </Field>
            <Field label="Tags" htmlFor="tags" hint="Comma separated. Used for broadcasts.">
              <Input id="tags" name="tags" defaultValue={contact.tags.join(", ")} />
            </Field>
            <Field label="Owner" htmlFor="ownerId">
              <Select id="ownerId" name="ownerId" defaultValue={contact.ownerId ?? ""}>
                <option value="">No owner</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="notes">
                <Textarea id="notes" name="notes" defaultValue={contact.notes ?? ""} />
              </Field>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="section-label text-faint">Custom fields</div>
              {[...fields, ["", ""]].map(([k, v], i) => (
                <div key={i} className="flex gap-2">
                  <Input name="fieldKey" placeholder="field name, e.g. birthday" aria-label="Field name" defaultValue={k} />
                  <Input name="fieldValue" placeholder="value" aria-label="Field value" defaultValue={v} />
                </div>
              ))}
              <p className="text-xs text-muted">Use custom fields in broadcasts as variables.</p>
            </div>
            <div className="sm:col-span-2">
              <Button>Save contact</Button>
            </div>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="type-heading">Marketing messages</h2>
            <p className="mt-1 text-sm text-muted">
              {contact.optedOutAt ? `Opted out on ${dateTime(contact.optedOutAt)}. They won't get marketing broadcasts.` : "Subscribed. They can reply STOP at any time."}
            </p>
            <form action={setOptOut} className="mt-3">
              <input type="hidden" name="id" value={contact.id} />
              <input type="hidden" name="optOut" value={contact.optedOutAt ? "0" : "1"} />
              <Button size="sm" variant="secondary">
                {contact.optedOutAt ? "Mark as subscribed (they asked)" : "Opt them out"}
              </Button>
            </form>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="type-heading">Orders</h2>
              <Link href={`/orders/new?contact=${contact.id}`} className="text-sm link">
                + New order
              </Link>
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted">
                  {orders.length} order{orders.length === 1 ? "" : "s"} · {formatMoney(orders.filter((o) => o.paymentStatus === "paid").reduce((t, o) => t + o.totalMinor, 0))} paid · last {dateTime(orders[0].createdAt)}
                </p>
                {orders.map((o) => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between py-1 text-sm hover:underline">
                    <span>#{o.number}</span>
                    <span className="text-muted">
                      {o.status} · {o.paymentStatus.replace("_", " ")} · {formatMoney(o.totalMinor, o.currency)}
                    </span>
                  </Link>
                ))}
              </>
            )}
            {appointments.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 type-heading">Appointments</h3>
                {appointments.map(({ a, service }) => (
                  <div key={a.id} className="flex justify-between py-1 text-sm">
                    <span>{service}</span>
                    <span className="text-muted">
                      {dateTime(a.startAt, org.timezone)} · {a.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 type-heading">Leads</h2>
            {leads.length === 0 && <p className="text-sm text-muted">None yet.</p>}
            {leads.map((l) => (
              <Link key={l.lead.id} href="/pipeline" className="flex justify-between py-1 text-sm hover:underline">
                <span>{l.lead.title}</span>
                <span className="text-muted">
                  {l.stage} · {formatMoney(l.lead.valueMinor, l.lead.currency)}
                </span>
              </Link>
            ))}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 type-heading">Activity</h2>
            <ol className="space-y-2">
              {timeline.map((t, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span>{t.text}</span>
                    {t.status && <StatusBadge status={t.status} />}
                  </div>
                  <div className="text-xs text-muted">{dateTime(t.at)}</div>
                </li>
              ))}
            </ol>
          </Card>
          {contact.source === "ad" && <Badge tone="accent">Came from an ad</Badge>}
          {role !== "agent" && (
            <form action={deleteContact}>
              <input type="hidden" name="id" value={contact.id} />
              <Button size="sm" variant="ghost" className="text-danger">
                Delete contact and their chats
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
