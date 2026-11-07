import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Upload, Users } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { bulkTag, createContact } from "./actions";

export const metadata: Metadata = { title: "Contacts" };

const ERR: Record<string, string> = { phone: "That doesn't look like a phone number.", exists: "A contact with that number already exists." };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; error?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg();
  const where = [eq(schema.contacts.orgId, org.id)];
  if (sp.q) where.push(or(ilike(schema.contacts.name, `%${sp.q}%`), ilike(schema.contacts.waId, `%${sp.q.replace(/\D/g, "") || sp.q}%`))!);
  if (sp.tag) where.push(sql`${sp.tag} = any(${schema.contacts.tags})`);
  const [rows, tagRows, [count]] = await Promise.all([
    d.select().from(schema.contacts).where(and(...where)).orderBy(desc(schema.contacts.createdAt)).limit(200),
    d.execute(sql`select t as tag, count(*)::int as n from contacts, unnest(tags) t where org_id = ${org.id} group by t order by n desc limit 30`),
    d.select({ n: sql<number>`count(*)` }).from(schema.contacts).where(eq(schema.contacts.orgId, org.id)),
  ]);
  const tags = ((tagRows as unknown as { rows?: { tag: string; n: number }[] }).rows ?? (tagRows as unknown as { tag: string; n: number }[]));
  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${Number(count.n)} people. Everyone who messages you is saved automatically.`}
        actions={
          <ButtonLink variant="secondary" href="/contacts/import">
            <Upload size={16} /> Import CSV
          </ButtonLink>
        }
      />
      <div className="space-y-4 p-6">
        {sp.error && <Alert tone="danger">{ERR[sp.error] ?? "Something went wrong."}</Alert>}
        {sp.deleted && <Alert tone="success">Contact deleted.</Alert>}
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex gap-2">
            <Input name="q" placeholder="Search name or number" defaultValue={sp.q} aria-label="Search contacts" className="w-64" />
            {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
            <Button variant="secondary">Search</Button>
          </form>
          <details className="ml-auto">
            <summary className="cursor-pointer text-sm text-accent">+ Add a contact</summary>
            <form action={createContact} className="mt-2 flex flex-wrap gap-2">
              <Input name="name" placeholder="Name" aria-label="Name" className="w-40" />
              <Input name="phone" placeholder="Phone with country code" aria-label="Phone" required className="w-48" />
              <Input name="tags" placeholder="tags, comma separated" aria-label="Tags" className="w-48" />
              <Button>Add</Button>
            </form>
          </details>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Link href="/contacts" className={`rounded-full px-2.5 py-1 text-xs ${!sp.tag ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
              All
            </Link>
            {tags.map((t) => (
              <Link key={t.tag} href={`/contacts?tag=${encodeURIComponent(t.tag)}`} className={`rounded-full px-2.5 py-1 text-xs ${sp.tag === t.tag ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
                {t.tag} · {t.n}
              </Link>
            ))}
          </div>
        )}
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={<Users />} title="No contacts yet" body="They appear here as soon as someone messages your number, or import a spreadsheet." action={<ButtonLink href="/contacts/import">Import CSV</ButtonLink>} />
          ) : (
            <form action={bulkTag}>
              <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <Input name="tag" placeholder="Tag selected as…" aria-label="Tag to add" className="h-8 w-48 text-[13px]" />
                <Button size="sm" variant="secondary">
                  Add tag
                </Button>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-8">
                      <span className="sr-only">Select</span>
                    </Th>
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>Tags</Th>
                    <Th>Source</Th>
                    <Th>Last message</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <Td>
                        <input type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.name ?? c.waId}`} />
                      </Td>
                      <Td>
                        <Link href={`/contacts/${c.id}`} className="font-medium text-ink hover:text-accent">
                          {c.name ?? "—"}
                        </Link>
                        {c.optedOutAt && (
                          <Badge tone="warning" className="ml-2">
                            opted out
                          </Badge>
                        )}
                      </Td>
                      <Td className="text-muted">{formatWaId(c.waId)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-muted">{c.source}</Td>
                      <Td className="text-muted">{timeAgo(c.lastInboundAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
