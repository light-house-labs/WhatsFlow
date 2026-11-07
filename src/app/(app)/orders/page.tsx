import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ShoppingBag } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { formatMoney } from "@/lib/plans";
import { timeAgo } from "@/lib/format";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = {
  all: null,
  unpaid: ["paymentStatus", ["unpaid", "link_sent"]],
  paid: ["paymentStatus", ["paid"]],
  to_ship: ["status", ["confirmed"]],
  shipped: ["status", ["shipped"]],
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ f?: keyof typeof FILTERS; error?: string }> }) {
  const sp = await searchParams;
  const f = sp.f && sp.f in FILTERS ? sp.f : "all";
  const { db: d, org } = await requireOrg();
  const rows = await d
    .select({ o: schema.orders, name: schema.contacts.name, waId: schema.contacts.waId })
    .from(schema.orders)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.orders.contactId))
    .where(eq(schema.orders.orgId, org.id))
    .orderBy(desc(schema.orders.createdAt))
    .limit(500);
  const rule = FILTERS[f];
  const list = rule ? rows.filter(({ o }) => (rule[1] as readonly string[]).includes(o[rule[0]])) : rows;
  const tab = (key: keyof typeof FILTERS, label: string) => (
    <Link key={key} href={key === "all" ? "/orders" : `/orders?f=${key}`} className={`rounded-full px-3 py-1 text-xs ${f === key ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader title="Orders" description="Orders taken in chat, with payment and delivery status." actions={<ButtonLink href="/orders/new">New order</ButtonLink>} />
      <div className="space-y-4 p-6">
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        <div className="flex flex-wrap gap-1.5">
          {tab("all", "All")}
          {tab("unpaid", "Awaiting payment")}
          {tab("paid", "Paid")}
          {tab("to_ship", "To ship")}
          {tab("shipped", "Shipped")}
        </div>
        <Card>
          {list.length === 0 ? (
            <EmptyState icon={<ShoppingBag />} title="No orders here" body="Create one from the inbox, or add a “Take an order” block to a bot flow." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Customer</Th>
                  <Th>Items</Th>
                  <Th>Total</Th>
                  <Th>Payment</Th>
                  <Th>Status</Th>
                  <Th>Placed</Th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ o, name, waId }) => (
                  <tr key={o.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:text-accent">
                        #{o.number}
                      </Link>
                    </Td>
                    <Td>{name ?? formatWaId(waId)}</Td>
                    <Td className="max-w-xs truncate text-muted">{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</Td>
                    <Td>{formatMoney(o.totalMinor, o.currency)}</Td>
                    <Td>
                      <StatusBadge status={o.paymentStatus} />
                    </Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                    <Td className="text-muted">{timeAgo(o.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
