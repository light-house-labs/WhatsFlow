import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { ButtonLink, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Campaigns" };

const COLS = ["Campaign", "Status", "Recipients", "Delivered", "Read", "Replied", "When"];

export default async function Page() {
  const { db: d, org, role } = await requireOrg();
  const r = schema.campaignRecipients;
  const [{ n: approved }] = await d.select({ n: count() }).from(schema.templates).where(and(eq(schema.templates.orgId, org.id), eq(schema.templates.status, "approved")));
  const rows = await d
    .select({
      c: schema.campaigns,
      template: schema.templates.name,
      total: sql<number>`count(${r.id})`,
      delivered: sql<number>`count(${r.id}) filter (where ${r.status} in ('delivered','read','replied'))`,
      read: sql<number>`count(${r.id}) filter (where ${r.status} in ('read','replied'))`,
      replied: sql<number>`count(${r.id}) filter (where ${r.status} = 'replied')`,
    })
    .from(schema.campaigns)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.campaigns.templateId))
    .leftJoin(r, eq(r.campaignId, schema.campaigns.id))
    .where(eq(schema.campaigns.orgId, org.id))
    .groupBy(schema.campaigns.id, schema.templates.name)
    .orderBy(desc(schema.campaigns.createdAt));
  const pct = (a: number, b: number) => (b ? `${Math.round((Number(a) / Number(b)) * 100)}%` : "—");
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Broadcast an approved template to a segment. Replies land in the inbox."
        actions={
          role !== "agent" && (
            <ButtonLink href="/campaigns/new">
              <Plus size={16} /> New campaign
            </ButtonLink>
          )
        }
      />
      <div className="p-6">
        {rows.length === 0 ? (
approved === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              columns={COLS}
              title="No campaigns yet"
              description="Broadcasts need an approved message template first."
              primary={{ label: "Create a template", href: "/templates/new", allow: role !== "agent" }}
              askAdmin="create a template"
            />
          ) : (
            <EmptyState
              icon={<Megaphone />}
              columns={COLS}
              title="No campaigns yet"
              description="Send reminders, updates or offers to everyone with a tag."
              primary={{ label: "New campaign", href: "/campaigns/new", allow: role !== "agent" }}
              askAdmin="send a campaign"
            />
          )
) : (
<Card>
            <Table>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th>Status</Th>
                  <Th>Recipients</Th>
                  <Th>Delivered</Th>
                  <Th>Read</Th>
                  <Th>Replied</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.c.id} className="hover:bg-hover">
                    <Td>
                      <Link href={`/campaigns/${x.c.id}`} className="font-medium hover:underline">
                        {x.c.name}
                      </Link>
                      <div className="text-xs text-muted">{x.template}</div>
                    </Td>
                    <Td>
                      <StatusBadge status={x.c.status} />
                    </Td>
                    <Td>{Number(x.total)}</Td>
                    <Td>{pct(x.delivered, x.total)}</Td>
                    <Td>{pct(x.read, x.total)}</Td>
                    <Td>{pct(x.replied, x.total)}</Td>
                    <Td className="text-muted">{dateTime(x.c.sentAt ?? x.c.scheduledAt ?? x.c.createdAt)}</Td>
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
