import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { dateTime } from "@/lib/format";
import { Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { updateTicket } from "../actions";

export const metadata = { title: "Ticket" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org } = await requireOrg();
  const [row] = await d
    .select({ t: schema.tickets, c: schema.contacts })
    .from(schema.tickets)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.tickets.contactId))
    .where(and(eq(schema.tickets.id, id), eq(schema.tickets.orgId, org.id)))
    .limit(1);
  if (!row) notFound();
  const { t, c } = row;
  const [members, messages] = await Promise.all([
    d.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, org.id)),
    t.conversationId ? d.select().from(schema.messages).where(eq(schema.messages.conversationId, t.conversationId)).orderBy(asc(schema.messages.createdAt)).limit(60) : Promise.resolve([]),
  ]);
  const toLocal = (x: Date | null) => (x ? new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  return (
    <>
      <PageHeader
        title={`#${t.number} ${t.subject}`}
        description={`${c.name ?? formatWaId(c.waId)} · opened ${dateTime(t.createdAt)}${t.resolvedAt ? ` · resolved ${dateTime(t.resolvedAt)}` : ""}`}
        actions={t.conversationId && <ButtonLink variant="secondary" href={`/inbox?c=${t.conversationId}`}>Open chat</ButtonLink>}
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Conversation</h2>
          {messages.length === 0 && <p className="text-sm text-muted">No chat linked.</p>}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className={cx("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[75%] rounded-lg px-3 py-2 text-sm", m.direction === "out" ? "bg-bubble-out" : "bg-surface-2")}>
                  {(m.payload?.media as { id?: string; mimeType?: string } | undefined)?.mimeType?.startsWith("image/") && (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL
                    <img src={`/api/media/${m.id}`} alt="Photo from customer" className="mb-1 max-h-56 rounded" />
                  )}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className="mt-0.5 text-right text-[10px] text-muted">{dateTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <form action={updateTicket} className="space-y-4">
            <input type="hidden" name="id" value={t.id} />
            <Field label="Subject" htmlFor="subject">
              <Input id="subject" name="subject" defaultValue={t.subject} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue={t.status}>
                  <option value="open">Open</option>
                  <option value="pending">Waiting on customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </Select>
              </Field>
              <Field label="Priority" htmlFor="priority">
                <Select id="priority" name="priority" defaultValue={t.priority}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
            </div>
            <Field label="Assignee" htmlFor="assigneeId">
              <Select id="assigneeId" name="assigneeId" defaultValue={t.assigneeId ?? ""}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due" htmlFor="dueAt">
              <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={toLocal(t.dueAt)} />
            </Field>
            <Field label="Details" htmlFor="description">
              <Textarea id="description" name="description" defaultValue={t.description ?? ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notify" defaultChecked /> Message the customer when I mark it resolved
            </label>
            <Button>Save ticket</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
