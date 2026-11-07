import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { Alert, ButtonLink, Card, PageHeader, Stat } from "@/components/ui";
import { duration } from "@/lib/format";
import { formatMoney } from "@/lib/plans";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg();
  const since = new Date(Date.now() - 7 * 86400_000);
  const o = org.id;
  const [[enq], [convs], [leadsOpen], [won], [tix], [msgs], numbers, liveFlows, days] = await Promise.all([
    d
      .select({
        total: sql<number>`count(*)`,
        bot: sql<number>`count(*) filter (where ${schema.enquiries.status} = 'answered_by_bot')`,
        waiting: sql<number>`count(*) filter (where ${schema.enquiries.status} = 'needs_human')`,
        avgFirst: sql<number>`avg(${schema.enquiries.firstResponseSeconds}) filter (where ${schema.enquiries.firstResponseSeconds} > 0)`,
      })
      .from(schema.enquiries)
      .where(and(eq(schema.enquiries.orgId, o), gte(schema.enquiries.createdAt, since))),
    d
      .select({ open: sql<number>`count(*) filter (where ${schema.conversations.status} <> 'closed')`, unassigned: sql<number>`count(*) filter (where ${schema.conversations.status} <> 'closed' and ${schema.conversations.assigneeId} is null and ${schema.conversations.handledBy} = 'human')` })
      .from(schema.conversations)
      .where(eq(schema.conversations.orgId, o)),
    d
      .select({ n: sql<number>`count(*)`, value: sql<number>`coalesce(sum(${schema.leads.valueMinor}),0)` })
      .from(schema.leads)
      .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.leads.stageId))
      .where(and(eq(schema.leads.orgId, o), eq(schema.pipelineStages.kind, "open"))),
    d
      .select({ n: sql<number>`count(*)`, value: sql<number>`coalesce(sum(${schema.leads.valueMinor}),0)` })
      .from(schema.leads)
      .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.leads.stageId))
      .where(and(eq(schema.leads.orgId, o), eq(schema.pipelineStages.kind, "won"), gte(schema.leads.updatedAt, since))),
    d
      .select({ open: sql<number>`count(*) filter (where ${schema.tickets.status} in ('open','pending'))` })
      .from(schema.tickets)
      .where(eq(schema.tickets.orgId, o)),
    d
      .select({ inbound: sql<number>`count(*) filter (where ${schema.messages.direction} = 'in')`, outbound: sql<number>`count(*) filter (where ${schema.messages.direction} = 'out')` })
      .from(schema.messages)
      .where(and(eq(schema.messages.orgId, o), gte(schema.messages.createdAt, since))),
    d.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, o)),
    d.select({ id: schema.botFlows.id }).from(schema.botFlows).where(and(eq(schema.botFlows.orgId, o), eq(schema.botFlows.status, "live"))),
    d.execute<{ day: string; n: number }>(sql`
      select to_char(local_day, 'Dy DD') as day, count(*)::int as n
      from (
        select date_trunc('day', created_at at time zone ${org.timezone}) as local_day
        from messages where org_id = ${o} and direction = 'in' and created_at >= ${since.toISOString()}::timestamptz
      ) m
      group by local_day order by local_day`),
  ]);
  const total = Number(enq.total);
  const botShare = total ? Math.round((Number(enq.bot) / total) * 100) : 0;
  const onlySandbox = numbers.every((n) => n.provider === "sandbox");
  const dayRows = (days as unknown as { rows?: { day: string; n: number }[] }).rows ?? (days as unknown as { day: string; n: number }[]);
  const max = Math.max(1, ...dayRows.map((r) => Number(r.n)));

  return (
    <>
      <PageHeader title="Dashboard" description="Last 7 days" actions={<ButtonLink href="/inbox">Open inbox</ButtonLink>} />
      <div className="space-y-6 p-6">
        {sp.denied && <Alert tone="danger">You don&apos;t have permission to open that page. Ask an owner or admin.</Alert>}
        {(sp.welcome || onlySandbox || liveFlows.length === 0) && (
          <Card className="p-5">
            <h2 className="font-semibold">Get going in three steps</h2>
            <ol className="mt-3 space-y-2 text-sm">
              <li>
                <span className={liveFlows.length ? "line-through text-muted" : ""}>1. Set your Welcome menu bot live</span> — <Link className="text-accent" href="/bots">Bot flows</Link>
              </li>
              <li>
                2. Message your business from the <Link className="text-accent" href="/sandbox">sandbox phone</Link> and reply from the <Link className="text-accent" href="/inbox">inbox</Link>
              </li>
              <li>
                <span className={!onlySandbox ? "line-through text-muted" : ""}>3. Connect your real WhatsApp number</span> — <Link className="text-accent" href="/settings/whatsapp">WhatsApp numbers</Link>
              </li>
            </ol>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Enquiries" value={total} hint={`${botShare}% answered by bot`} />
          <Stat label="Avg first human reply" value={duration(enq.avgFirst ? Math.round(Number(enq.avgFirst)) : null)} hint={`${Number(enq.waiting)} still waiting`} />
          <Stat label="Open conversations" value={Number(convs.open)} hint={`${Number(convs.unassigned)} unassigned`} />
          <Stat label="Open tickets" value={Number(tix.open)} />
          <Stat label="Open pipeline" value={formatMoney(Number(leadsOpen.value))} hint={`${Number(leadsOpen.n)} leads`} />
          <Stat label="Won this week" value={formatMoney(Number(won.value))} hint={`${Number(won.n)} deals`} />
          <Stat label="Messages in" value={Number(msgs.inbound)} />
          <Stat label="Messages out" value={Number(msgs.outbound)} />
        </div>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Customer messages per day</h2>
          {dayRows.length === 0 ? (
            <p className="text-sm text-muted">No messages yet this week.</p>
          ) : (
            <div className="flex h-40 items-end gap-3" role="img" aria-label="Bar chart of inbound messages per day">
              {dayRows.map((r) => (
                <div key={r.day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs text-muted">{Number(r.n)}</span>
                  <div className="w-full rounded-t bg-accent" style={{ height: `${(Number(r.n) / max) * 120}px` }} />
                  <span className="text-[11px] text-muted">{r.day}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
