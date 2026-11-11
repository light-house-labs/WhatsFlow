import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { ShoppingBag } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { formatMoney } from "@/lib/plans";
import { timeAgo } from "@/lib/format";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th, filterChip, segmentedTrack } from "@/components/ui";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = {
  all: null,
  unpaid: ["paymentStatus", ["unpaid", "link_sent"]],
  paid: ["paymentStatus", ["paid"]],
  to_ship: ["status", ["confirmed"]],
  shipped: ["status", ["shipped"]],
} as const;

const ORDER_COLS = ["#", "Customer", "Items", "Total", "Payment", "Status", "Placed"];

export default async function Page({ searchParams }: { searchParams: Promise<{ f?: keyof typeof FILTERS; error?: string }> }) {
  const sp = await searchParams;
  const f = sp.f && sp.f in FILTERS ? sp.f : "all";
  const { db: d, org, role } = await requireOrg();
  const [{ n: productCount }] = await d.select({ n: count() }).from(schema.products).where(eq(schema.products.orgId, org.id));
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
    <Link key={key} href={key === "all" ? "/orders" : `/orders?f=${key}`} className={filterChip(f === key)}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader title="Orders" description="Orders taken in chat, with payment and delivery status." actions={<ButtonLink href="/orders/new">New order</ButtonLink>} />
      <div className="space-y-4 p-6">
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        <div className={segmentedTrack}>
          {tab("all", "All")}
          {tab("unpaid", "Awaiting payment")}
          {tab("paid", "Paid")}
          {tab("to_ship", "To ship")}
          {tab("shipped", "Shipped")}
        </div>
        {list.length === 0 ? (
rows.length > 0 ? (
            <EmptyState variant="filtered" columns={ORDER_COLS} primary={{ href: "/orders" }} />
          ) : productCount === 0 ? (
            <EmptyState
              icon={<ShoppingBag />}
              columns={ORDER_COLS}
              title="No orders yet"
              description="Add the products you sell first, then orders can be taken in chat."
              primary={{ label: "Add products first", href: "/catalog?new=1", allow: role !== "agent" }}
              askAdmin="add products"
            />
          ) : (
            <EmptyState
              icon={<ShoppingBag />}
              columns={ORDER_COLS}
              title="No orders yet"
              description="Orders taken in chat appear here with payment and delivery status."
              primary={{ label: "New order", href: "/orders/new" }}
              hint={
                <>
                  Or add a “Take an order” block to a <Link href="/bots">bot flow</Link>.
                </>
              }
            />
          )
) : (
<Card>
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
                  <tr key={o.id} className="hover:bg-hover">
                    <Td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
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
          </Card>
)}
      </div>
    </>
  );
}
