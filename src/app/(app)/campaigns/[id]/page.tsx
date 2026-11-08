import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { dateTime, nowMs } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button, Card, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { cancelCampaign } from "../actions";

export const metadata = { title: "Campaign" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db: d, org, role } = await requireOrg();
  const [c] = await d.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, org.id))).limit(1);
  if (!c) notFound();
  const r = schema.campaignRecipients;
  const [[s], recipients, [tpl]] = await Promise.all([
    d
      .select({
        total: sql<number>`count(*)`,
        sent: sql<number>`count(*) filter (where ${r.status} in ('sent','delivered','read','replied'))`,
        delivered: sql<number>`count(*) filter (where ${r.status} in ('delivered','read','replied'))`,
        read: sql<number>`count(*) filter (where ${r.status} in ('read','replied'))`,
        replied: sql<number>`count(*) filter (where ${r.status} = 'replied')`,
        failed: sql<number>`count(*) filter (where ${r.status} = 'failed')`,
        skipped: sql<number>`count(*) filter (where ${r.status} = 'skipped')`,
      })
      .from(r)
      .where(eq(r.campaignId, id)),
    d
      .select({ r, name: schema.contacts.name, waId: schema.contacts.waId })
      .from(r)
      .innerJoin(schema.contacts, eq(schema.contacts.id, r.contactId))
      .where(eq(r.campaignId, id))
      .orderBy(desc(r.status))
      .limit(300),
    d.select().from(schema.templates).where(eq(schema.templates.id, c.templateId)),
  ]);
  const [segment] = c.audience.segmentId
    ? await d.select({ name: schema.segments.name }).from(schema.segments).where(and(eq(schema.segments.id, c.audience.segmentId), eq(schema.segments.orgId, org.id)))
    : [];
  const audienceLabel = c.audience.segmentId ? `segment: ${segment?.name ?? "deleted"}` : c.audience.tags?.length ? `tags: ${c.audience.tags.join(", ")}` : "all contacts";
  const live = c.status === "scheduled" || c.status === "sending";
  const settling = live || (c.sentAt && nowMs() - c.sentAt.getTime() < 2 * 60_000);
  const pct = (a: number) => (Number(s.total) ? ` · ${Math.round((Number(a) / Number(s.total)) * 100)}%` : "");
  return (
    <>
      {settling && <AutoRefresh ms={3000} />}
      <PageHeader
        title={c.name}
        description={`${tpl?.name} · ${audienceLabel} · ${c.scheduledAt ? `scheduled for ${dateTime(c.scheduledAt)}` : `started ${dateTime(c.sentAt ?? c.createdAt)}`}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {live && role !== "agent" && (
              <form action={cancelCampaign}>
                <input type="hidden" name="id" value={c.id} />
                <Button variant="secondary" size="sm">
                  Cancel
                </Button>
              </form>
            )}
          </>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Stat label="Recipients" value={Number(s.total)} />
          <Stat label="Sent" value={Number(s.sent)} />
          <Stat label="Delivered" value={`${Number(s.delivered)}${pct(s.delivered)}`} />
          <Stat label="Read" value={`${Number(s.read)}${pct(s.read)}`} />
          <Stat label="Replied" value={`${Number(s.replied)}${pct(s.replied)}`} />
          <Stat label="Failed / skipped" value={`${Number(s.failed)} / ${Number(s.skipped)}`} />
        </div>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((x) => (
                <tr key={x.r.id}>
                  <Td>{x.name ?? formatWaId(x.waId)}</Td>
                  <Td>
                    <StatusBadge status={x.r.status} />
                  </Td>
                  <Td className="text-muted">{x.r.error}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
