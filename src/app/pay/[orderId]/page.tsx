import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMoney } from "@/lib/plans";
import { sandboxPaymentsAllowed } from "@/lib/payments";
import { Button, Card } from "@/components/ui";
import { payInSandbox } from "./actions";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

/** Stand-in checkout for sandbox payment links. Never available in production unless PAYMENTS_SANDBOX=1. */
export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  if (!sandboxPaymentsAllowed()) notFound();
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const d = await db();
  const [row] = await d
    .select({ o: schema.orders, org: schema.orgs.name })
    .from(schema.orders)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.orders.orgId))
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!row || row.o.paymentProvider !== "sandbox") notFound();
  const { o } = row;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 p-4">
      <Card className="w-full max-w-sm space-y-4 p-6">
        <div className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Test checkout. No real money moves.</div>
        <div>
          <div className="text-sm text-muted">{row.org}</div>
          <h1 className="type-title">Order #{o.number}</h1>
        </div>
        <ul className="space-y-1 text-sm">
          {o.items.map((i, n) => (
            <li key={n} className="flex justify-between">
              <span>
                {i.qty} × {i.name}
              </span>
              <span>{formatMoney(i.qty * i.priceMinor, o.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <span>Total</span>
          <span>{formatMoney(o.totalMinor, o.currency)}</span>
        </div>
        {o.paymentStatus === "paid" ? (
          <p className="text-center text-sm font-medium text-success">Paid. Thank you!</p>
        ) : (
          <form action={payInSandbox}>
            <input type="hidden" name="orderId" value={o.id} />
            <Button className="w-full">Pay {formatMoney(o.totalMinor, o.currency)}</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
