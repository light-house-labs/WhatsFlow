import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { formatMoney } from "@/lib/plans";
import { dateTime } from "@/lib/format";
import { Alert, Button, Card, Field, Input, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { markPaidAction, sendLinkAction, setStatusAction } from "../actions";

export const metadata: Metadata = { title: "Order" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; sent?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { db: d, org, role } = await requireOrg();
  const [row] = await d
    .select({ o: schema.orders, c: schema.contacts })
    .from(schema.orders)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.orders.contactId))
    .where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, org.id)))
    .limit(1);
  if (!row) notFound();
  const { o, c } = row;
  const events = await d
    .select({ e: schema.orderEvents, who: schema.users.name })
    .from(schema.orderEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.orderEvents.actorId))
    .where(eq(schema.orderEvents.orderId, o.id))
    .orderBy(asc(schema.orderEvents.createdAt));
  const tickets = await d.select().from(schema.tickets).where(and(eq(schema.tickets.orgId, org.id), eq(schema.tickets.orderId, o.id)));
  return (
    <>
      <PageHeader
        title={`Order #${o.number}`}
        description={`${c.name ?? formatWaId(c.waId)} · placed ${dateTime(o.createdAt, org.timezone)} · via ${o.source}`}
        actions={
          o.conversationId ? (
            <Link href={`/inbox?c=${o.conversationId}`} className="text-sm link">
              Open chat
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {sp.error && <Alert tone="danger">{sp.error}</Alert>}
          {sp.sent && <Alert tone="success">Payment link sent in the chat.</Alert>}
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Qty</Th>
                  <Th>Price</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((i, n) => (
                  <tr key={n}>
                    <Td>{i.name}</Td>
                    <Td>{i.qty}</Td>
                    <Td>{formatMoney(i.priceMinor, o.currency)}</Td>
                    <Td className="text-right">{formatMoney(i.qty * i.priceMinor, o.currency)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="font-semibold">Total</Td>
                  <Td />
                  <Td />
                  <Td className="text-right font-semibold">{formatMoney(o.totalMinor, o.currency)}</Td>
                </tr>
              </tbody>
            </Table>
          </Card>
          {o.notes && (
            <Card className="p-5 text-sm">
              <h2 className="mb-1 type-heading">Notes</h2>
              <p className="whitespace-pre-wrap text-muted">{o.notes}</p>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 type-heading">Timeline</h2>
            <ol className="space-y-3 border-l border-line pl-4 text-sm">
              {events.map(({ e, who }) => (
                <li key={e.id}>
                  <div className="font-medium capitalize">{e.kind.replaceAll("_", " ")}</div>
                  <div className="text-muted">
                    {e.detail ? `${e.detail} · ` : ""}
                    {dateTime(e.createdAt, org.timezone)}
                    {who ? ` · ${who}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Payment</span>
              <StatusBadge status={o.paymentStatus} />
            </div>
            {o.paymentUrl && (
              <p className="break-all text-xs text-muted">
                {o.paymentProvider} · <a href={o.paymentUrl} className="link" target="_blank" rel="noreferrer">{o.paymentUrl}</a>
              </p>
            )}
            {o.paymentStatus !== "paid" && (
              <>
                <form action={sendLinkAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <Button className="w-full" disabled={!o.conversationId}>
                    {o.paymentUrl ? "Resend payment link" : "Send payment link"}
                  </Button>
                </form>
                {role !== "agent" && (
                  <form action={markPaidAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <Button variant="secondary" className="w-full">
                      Mark paid (cash / UPI / transfer)
                    </Button>
                  </form>
                )}
              </>
            )}
            {o.paidAt && <p className="text-xs text-muted">Paid {dateTime(o.paidAt, org.timezone)}</p>}
          </Card>
          <Card className="p-5">
            <form action={setStatusAction} className="space-y-3">
              <input type="hidden" name="id" value={o.id} />
              <Field label="Order status" htmlFor="status">
                <Select id="status" name="status" defaultValue={o.status}>
                  {["pending", "confirmed", "shipped", "delivered", "cancelled"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tracking (optional)" htmlFor="tracking">
                <Input id="tracking" name="tracking" placeholder="Courier and AWB, or a link" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notify" defaultChecked /> Message the customer
              </label>
              <Button variant="secondary" className="w-full">
                Update status
              </Button>
            </form>
          </Card>
          {tickets.length > 0 && (
            <Card className="p-5 text-sm">
              <h2 className="mb-2 type-heading">Tickets</h2>
              {tickets.map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="block link">
                  #{t.number} {t.subject}
                </Link>
              ))}
            </Card>
          )}
          <Link href={`/contacts/${c.id}`} className="block text-sm link">
            Customer profile →
          </Link>
        </aside>
      </div>
    </>
  );
}
