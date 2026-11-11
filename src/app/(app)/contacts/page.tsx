import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Filter, Upload, Users } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { describeRules, segmentWhere } from "@/lib/segments";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Table, Td, Th, filterChip, segmentedTrack } from "@/components/ui";
import { bulkTag, createContact } from "./actions";

export const metadata: Metadata = { title: "Contacts" };

const ERR: Record<string, string> = { phone: "That doesn't look like a phone number.", exists: "A contact with that number already exists." };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; segment?: string; error?: string; deleted?: string; new?: string; name?: string; phone?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg();
  const where = [eq(schema.contacts.orgId, org.id)];
  if (sp.q) where.push(or(ilike(schema.contacts.name, `%${sp.q}%`), ilike(schema.contacts.waId, `%${sp.q.replace(/\D/g, "") || sp.q}%`))!);
  if (sp.tag) where.push(sql`${sp.tag} = any(${schema.contacts.tags})`);
  const segments = await d.select().from(schema.segments).where(eq(schema.segments.orgId, org.id)).orderBy(schema.segments.name);
  const segment = segments.find((x) => x.id === sp.segment);
  if (segment) where.push(segmentWhere(org.id, segment.rules));
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
          <>
          <ButtonLink variant="secondary" href="/contacts/segments">
            <Filter size={16} /> Segments
          </ButtonLink>
          <ButtonLink variant="secondary" href="/contacts/import">
            <Upload size={16} /> Import CSV
          </ButtonLink>
          </>
        }
      />
      <div className="space-y-4 p-6">
        {sp.error && <Alert tone="danger">{ERR[sp.error] ?? "Something went wrong."}</Alert>}
        {sp.deleted && <Alert tone="success">Contact deleted.</Alert>}
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex gap-2">
            <Input data-bare name="q" placeholder="Search name or number" defaultValue={sp.q} aria-label="Search contacts" className="w-64" />
            {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
            {segment && <input type="hidden" name="segment" value={segment.id} />}
            <Button variant="secondary">Search</Button>
          </form>
          <details className="ml-auto" open={Boolean(sp.new)}>
            <summary className="section-label cursor-pointer text-faint">+ Add a contact</summary>
            <form action={createContact} className="mt-2 flex flex-wrap gap-2">
              <Input name="name" placeholder="Name" aria-label="Name" defaultValue={sp.name} autoFocus={Boolean(sp.new) && !sp.phone} className="w-40" />
              <Input name="phone" placeholder="Phone with country code" aria-label="Phone" defaultValue={sp.phone} autoFocus={Boolean(sp.phone)} required className="w-48" />
              <Input name="tags" placeholder="tags, comma separated" aria-label="Tags" className="w-48" />
              <Button>Add</Button>
            </form>
          </details>
        </div>
        {segments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Segments:</span>
            <div className={segmentedTrack}>
            {segments.map((x) => (
              <Link key={x.id} href={segment?.id === x.id ? "/contacts" : `/contacts?segment=${x.id}`} className={filterChip(segment?.id === x.id)}>
                {x.name}
              </Link>
            ))}
            </div>
          </div>
        )}
        {segment && <p className="text-sm text-muted">Showing contacts matching: {describeRules(segment.rules)}.</p>}
        {tags.length > 0 && (
          <div className={segmentedTrack}>
            <Link href="/contacts" className={filterChip(!sp.tag)}>
              All
            </Link>
            {tags.map((t) => (
              <Link key={t.tag} href={`/contacts?tag=${encodeURIComponent(t.tag)}`} className={filterChip(sp.tag === t.tag)}>
                {t.tag} · {t.n}
              </Link>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
sp.q || sp.tag || segment ? (
            <EmptyState variant="filtered" columns={["Name", "Phone", "Tags", "Source", "Last message"]} primary={{ href: "/contacts" }} />
          ) : (
            <EmptyState
              icon={<Users />}
              columns={["Name", "Phone", "Tags", "Source", "Last message"]}
              title="No contacts yet"
              description="People appear here as soon as they message your number. You can also add or import them."
              primary={{ label: "Add contact", href: "/contacts?new=1" }}
              secondary={{ label: "Import CSV", href: "/contacts/import" }}
            />
          )
) : (
<Card>
            <form action={bulkTag}>
              <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <Input name="tag" placeholder="Tag selected as…" aria-label="Tag to add" className="h-8 w-48 text-13" />
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
                    <tr key={c.id} className="hover:bg-hover">
                      <Td>
                        <input type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.name ?? c.waId}`} />
                      </Td>
                      <Td>
                        <Link href={`/contacts/${c.id}`} className="font-medium text-ink hover:underline">
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
          </Card>
)}
      </div>
    </>
  );
}
