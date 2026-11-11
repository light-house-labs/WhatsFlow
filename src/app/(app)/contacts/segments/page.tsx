import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Filter } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { countSegment, describeRules } from "@/lib/segments";
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { SegmentBuilder } from "./builder";
import { builderOptions } from "./data";
import { deleteSegment } from "./actions";

export const metadata: Metadata = { title: "Segments" };

export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  if (sp.new && role !== "agent") {
    const opts = await builderOptions(d, org.id);
    return (
      <>
        <PageHeader title="New segment" description="A saved filter. Use it to find people, or as a campaign audience that stays up to date." />
        <SegmentBuilder tags={opts.tags} fields={opts.fields} />
      </>
    );
  }
  const list = await d.select().from(schema.segments).where(eq(schema.segments.orgId, org.id)).orderBy(desc(schema.segments.updatedAt));
  const counts = await Promise.all(list.map((s) => countSegment(d, org.id, s.rules)));
  return (
    <>
      <PageHeader
        title="Segments"
        description="Saved filters over your contacts, like “ordered before but not in 60 days”."
        actions={role !== "agent" && <ButtonLink href="/contacts/segments?new=1">New segment</ButtonLink>}
      />
      <div className="space-y-4 p-6">
        {sp.saved && <Alert tone="success">Segment saved.</Alert>}
        {list.length === 0 ? (
<EmptyState
              icon={<Filter />}
              columns={["Name", "Who", "Contacts", ""]}
              title="No segments yet"
              description="Group contacts by tags, when they last messaged, what they've bought or any custom field, then broadcast to the group."
              primary={{ label: "New segment", href: "/contacts/segments?new=1", allow: role !== "agent" }}
              askAdmin="create a segment"
            />
) : (
<Card>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Who</Th>
                  <Th>Contacts</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/contacts?segment=${s.id}`} className="font-medium text-ink hover:underline">
                        {s.name}
                      </Link>
                    </Td>
                    <Td className="max-w-md text-muted">{describeRules(s.rules)}</Td>
                    <Td>{counts[i]}</Td>
                    <Td className="text-right">
                      {role !== "agent" && (
                        <div className="flex justify-end gap-2">
                          <ButtonLink href={`/campaigns/new?segment=${s.id}`} size="sm" variant="secondary">
                            Broadcast
                          </ButtonLink>
                          <ButtonLink href={`/contacts/segments/${s.id}`} size="sm" variant="ghost">
                            Edit
                          </ButtonLink>
                          <form action={deleteSegment}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`}>
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
      </div>
    </>
  );
}
