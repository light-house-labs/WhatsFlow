import { Package } from "lucide-react";
import type { Metadata } from "next";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { formatMoney } from "@/lib/plans";
import { Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createOrderAction } from "../actions";
import { SaveForm, SubmitButton } from "@/components/save-form";

export const metadata: Metadata = { title: "New order" };

export default async function Page({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  const [products, contacts] = await Promise.all([
    d.select().from(schema.products).where(and(eq(schema.products.orgId, org.id), eq(schema.products.active, true))).orderBy(asc(schema.products.name)),
    d.select().from(schema.contacts).where(eq(schema.contacts.orgId, org.id)).orderBy(desc(schema.contacts.lastInboundAt)).limit(300),
  ]);
  return (
    <>
      <PageHeader title="New order" description="Pick the customer and the products. Prices come from your catalog." />
      <div className="max-w-2xl space-y-4 p-6">
        {products.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="Your catalog is empty"
            description="Add products first, then come back to create the order."
            primary={{ label: "Add a product", href: "/catalog?new=1", allow: role !== "agent" }}
            askAdmin="add products"
          />
        ) : (
          <SaveForm action={createOrderAction} success="Order created" className="space-y-4">
            <Card className="space-y-4 p-5">
              <Field label="Customer" htmlFor="contactId">
                <Select id="contactId" name="contactId" defaultValue={sp.contact ?? ""} required>
                  <option value="">Choose…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (${formatWaId(c.waId)})` : formatWaId(c.waId)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="divide-y divide-line">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted">
                        {formatMoney(p.priceMinor, p.currency)}
                        {p.stock !== null && ` · ${p.stock} in stock`}
                      </div>
                    </div>
                    <Input type="number" name={`qty_${p.id}`} min={0} max={p.stock ?? 999} defaultValue={0} aria-label={`Quantity of ${p.name}`} className="w-20" />
                  </div>
                ))}
              </div>
              <Field label="Notes (optional)" htmlFor="notes">
                <Textarea id="notes" name="notes" rows={2} placeholder="Delivery address, size, gift message…" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sendLink" defaultChecked /> Send the order summary and a payment link in the chat
              </label>
            </Card>
            <SubmitButton>Create order</SubmitButton>
          </SaveForm>
        )}
      </div>
    </>
  );
}
