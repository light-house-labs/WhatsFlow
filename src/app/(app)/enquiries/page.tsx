import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { MessageCircleQuestion } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { duration, timeAgo } from "@/lib/format";
import { Card, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Enquiries" };

const FILTERS = [
  { id: "", label: "All" },
  { id: "needs_human", label: "Waiting for a person" },
  { id: "answered_by_bot", label: "Answered by bot" },
  { id: "answered", label: "Answered by team" },
  { id: "converted", label: "Became a lead or ticket" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { db: d, org } = await requireOrg();
  const where = [eq(schema.enquiries.orgId, org.id)];
  if (status) where.push(eq(schema.enquiries.status, status as "needs_human"));
  const since = new Date(Date.now() - 30 * 86400_000);
  const [rows, [s]] = await Promise.all([
    d
      .select({ e: schema.enquiries, name: schema.contacts.name, waId: schema.contacts.waId })
      .from(schema.enquiries)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.enquiries.contactId))
      .where(and(...where))
      .orderBy(desc(schema.enquiries.createdAt))
      .limit(200),
    d
      .select({
        total: sql<number>`count(*)`,
        bot: sql<number>`count(*) filter (where status = 'answered_by_bot')`,
        converted: sql<number>`count(*) filter (where status = 'converted')`,
        avg: sql<number>`avg(first_response_seconds) filter (where first_response_seconds > 0)`,
      })
      .from(schema.enquiries)
      .where(and(eq(schema.enquiries.orgId, org.id), gte(schema.enquiries.createdAt, since))),
  ]);
  return (
    <>
      <PageHeader title="Enquiries" description="Every new question from a customer, with who answered it and how fast." />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Enquiries (30 days)" value={Number(s.total)} />
          <Stat label="Answered by bot" value={Number(s.bot)} />
          <Stat label="Turned into leads/tickets" value={Number(s.converted)} />
          <Stat label="Avg first human reply" value={duration(s.avg ? Math.round(Number(s.avg)) : null)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link key={f.id} href={f.id ? `/enquiries?status=${f.id}` : "/enquiries"} className={`rounded-full px-3 py-1 text-xs ${(status ?? "") === f.id ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={<MessageCircleQuestion />} title="No enquiries" body="Each new conversation, or a message after a day of silence, is logged here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Asked</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th>First reply</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, name, waId }) => (
                  <tr key={e.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/inbox?c=${e.conversationId}`} className="font-medium hover:text-accent">
                        {name ?? formatWaId(waId)}
                      </Link>
                    </Td>
                    <Td className="max-w-sm truncate">{e.topic}</Td>
                    <Td className="text-muted">{e.source}</Td>
                    <Td>
                      <StatusBadge status={e.status} />
                      {e.convertedTo && <span className="ml-1 text-xs text-muted">→ {e.convertedTo}</span>}
                    </Td>
                    <Td className="text-muted">{e.status === "answered_by_bot" ? "instant" : duration(e.firstResponseSeconds)}</Td>
                    <Td className="text-muted">{timeAgo(e.createdAt)}</Td>
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
