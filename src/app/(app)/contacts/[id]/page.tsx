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

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org, role } = await requireOrg();
  const [contact] = await d.select().from(schema.contacts).where(and(eq(schema.contacts.id, id), eq(schema.contacts.orgId, org.id))).limit(1);
  if (!contact) notFound();
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
              <div className="text-[13px] font-medium">Custom fields</div>
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
            <h2 className="text-sm font-semibold">Marketing messages</h2>
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
            <h2 className="mb-3 text-sm font-semibold">Leads</h2>
            {leads.length === 0 && <p className="text-sm text-muted">None yet.</p>}
            {leads.map((l) => (
              <Link key={l.lead.id} href="/pipeline" className="flex justify-between py-1 text-sm hover:text-accent">
                <span>{l.lead.title}</span>
                <span className="text-muted">
                  {l.stage} · {formatMoney(l.lead.valueMinor, l.lead.currency)}
                </span>
              </Link>
            ))}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Activity</h2>
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
