import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { Package } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatMoney, limitsFor } from "@/lib/plans";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Field, Input, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { UploadField } from "@/components/upload-field";
import { deleteProduct, saveProduct } from "./actions";

export const metadata: Metadata = { title: "Catalog" };

export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  const products = await d.select().from(schema.products).where(eq(schema.products.orgId, org.id)).orderBy(asc(schema.products.name));
  const editing = sp.edit ? (await d.select().from(schema.products).where(and(eq(schema.products.id, sp.edit), eq(schema.products.orgId, org.id))))[0] : null;
  const admin = role !== "agent";
  const showForm = admin && (sp.new || editing);
  const limit = limitsFor(org.plan).products;
  return (
    <>
      <PageHeader
        title="Catalog"
        description={`Products your team and bots can sell in chat. ${products.length} of ${limit} on your plan.`}
        actions={admin && !showForm ? <ButtonLink href="/catalog?new=1">Add product</ButtonLink> : undefined}
      />
      <div className="space-y-4 p-6">
        {sp.saved && <Alert tone="success">Saved.</Alert>}
        {sp.error && <Alert tone="danger">{sp.error}</Alert>}
        {showForm && (
          <Card className="max-w-2xl p-5">
            <h2 className="mb-4 type-heading">{editing ? "Edit product" : "New product"}</h2>
            <form action={saveProduct} className="space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name">
                  <Input id="name" name="name" required maxLength={120} defaultValue={editing?.name} />
                </Field>
                <Field label="Price (₹)" htmlFor="price">
                  <Input id="price" name="price" required inputMode="decimal" defaultValue={editing ? (editing.priceMinor / 100).toString() : ""} />
                </Field>
                <Field label="SKU (optional)" htmlFor="sku">
                  <Input id="sku" name="sku" defaultValue={editing?.sku ?? ""} />
                </Field>
                <Field label="Stock" htmlFor="stock" hint="Leave empty if you don't track stock. Orders reduce it; cancelled orders put it back.">
                  <Input id="stock" name="stock" type="number" min={0} defaultValue={editing?.stock ?? ""} />
                </Field>
              </div>
              <Field label="Description" htmlFor="description" hint="The AI assistant uses this to answer questions.">
                <Textarea id="description" name="description" rows={3} defaultValue={editing?.description ?? ""} />
              </Field>
              <UploadField name="imageUrl" label="Image" accept="image/jpeg,image/png,image/webp" defaultValue={editing?.imageUrl ?? ""} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} /> Available to order
              </label>
              <div className="flex gap-2">
                <Button>Save</Button>
                <ButtonLink href="/catalog" variant="secondary">
                  Cancel
                </ButtonLink>
              </div>
            </form>
          </Card>
        )}
        {products.length === 0 ? (
<EmptyState
            icon={<Package />}
            columns={["Product", "Price", "Stock", "Status", ""]}
            title="No products yet"
            description="Add what you sell so bots can take orders and send payment links, and the AI assistant can answer price questions."
            primary={{ label: "Add product", href: "/catalog?new=1", allow: admin && !showForm }}
            askAdmin="add products"
            hint={
              <>
                Then sell from the <Link href="/inbox">inbox</Link> or a <Link href="/bots">bot flow</Link>.
              </>
            }
          />
) : (
<Card>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Price</Th>
                  <Th>Stock</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- merchant-supplied URLs from any host
                          <img src={p.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-surface-2" />
                        )}
                        <div>
                          <div className="font-medium">{p.name}</div>
                          {p.sku && <div className="text-xs text-muted">{p.sku}</div>}
                        </div>
                      </div>
                    </Td>
                    <Td>{formatMoney(p.priceMinor, p.currency)}</Td>
                    <Td className={p.stock === 0 ? "font-medium text-danger" : "text-muted"}>{p.stock ?? "Not tracked"}</Td>
                    <Td>{p.active ? <Badge tone="success">Available</Badge> : <Badge>Hidden</Badge>}</Td>
                    <Td className="text-right">
                      {admin && (
                        <div className="flex justify-end gap-1">
                          <ButtonLink href={`/catalog?edit=${p.id}`} size="sm" variant="ghost">
                            Edit
                          </ButtonLink>
                          <form action={deleteProduct}>
                            <input type="hidden" name="id" value={p.id} />
                            <Button size="sm" variant="ghost" className="text-danger">
                              Delete
                            </Button>
                          </form>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
)}
        <p className="text-xs text-muted">
          Sell in chat from the inbox (<strong>New order</strong>) or with a bot flow&apos;s <strong>Take an order</strong> block. Payment links use{" "}
          <Link href="/settings/payments" className="link">
            your payment provider
          </Link>
          .
        </p>
      </div>
    </>
  );
}
