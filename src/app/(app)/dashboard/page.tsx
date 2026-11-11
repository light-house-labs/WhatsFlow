import type { Metadata } from "next";
import { cookies } from "next/headers";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { Alert, ButtonLink, Card, PageHeader, Stat } from "@/components/ui";
import { duration, nowMs } from "@/lib/format";
import { formatMoney } from "@/lib/plans";
import { GetStarted, type GetStartedStep } from "./get-started";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const sp = await searchParams;
  const { db: d, org, role } = await requireOrg();
  const since = new Date(nowMs() - 7 * 86400_000);
  const o = org.id;
  // Per workspace, so dismissing in one doesn't hide another's checklist.
  const hideCookie = `wf_get_started_hidden_${o.replace(/-/g, "")}`;
  const hidden = (await cookies()).has(hideCookie);
  const [[enq], [convs], [leadsOpen], [won], [tix], [msgs], numbers, [flows], days, [prod], [mem], [inv], [sandboxTest]] = await Promise.all([
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
    // Every workspace starts with one draft starter flow, so "created" means a second flow or one set live.
    d
      .select({ n: count(), live: sql<number>`count(*) filter (where ${schema.botFlows.status} = 'live')` })
      .from(schema.botFlows)
      .where(eq(schema.botFlows.orgId, o)),
    d.execute<{ day: string; n: number }>(sql`
      select to_char(local_day, 'Dy DD') as day, count(*)::int as n
      from (
        select date_trunc('day', created_at at time zone ${org.timezone}) as local_day
        from messages where org_id = ${o} and direction = 'in' and created_at >= ${since.toISOString()}::timestamptz
      ) m
      group by local_day order by local_day`),
    d.select({ n: count() }).from(schema.products).where(eq(schema.products.orgId, o)),
    d.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.orgId, o)),
    d.select({ n: count() }).from(schema.invites).where(and(eq(schema.invites.orgId, o), isNull(schema.invites.acceptedAt))),
    d
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .innerJoin(schema.waNumbers, eq(schema.waNumbers.id, schema.conversations.numberId))
      .where(and(eq(schema.messages.orgId, o), eq(schema.messages.direction, "in"), eq(schema.waNumbers.provider, "sandbox")))
      .limit(1),
  ]);
  const total = Number(enq.total);
  const botShare = total ? Math.round((Number(enq.bot) / total) * 100) : 0;
  const steps: GetStartedStep[] = [
    {
      label: "Connect WhatsApp number",
      hint: "Link your business number through Meta's Cloud API.",
      href: "/settings/whatsapp",
      done: numbers.some((n) => n.provider !== "sandbox" && n.status === "connected"),
    },
    { label: "Add products", hint: "So bots and agents can take orders in chat.", href: "/catalog?new=1", done: prod.n > 0 },
    { label: "Create a bot flow", hint: "Edit the starter flow and set it live, or build your own.", href: "/bots", done: flows.n > 1 || Number(flows.live) > 0 },
    { label: "Invite a teammate", hint: "Share the inbox so nobody waits.", href: "/settings/team", done: mem.n > 1 || inv.n > 0 },
    { label: "Send a test in the sandbox", hint: "Message yourself as a customer and see it land in the inbox.", href: "/settings/sandbox", done: Boolean(sandboxTest) },
  ];
  const dayRows = (days as unknown as { rows?: { day: string; n: number }[] }).rows ?? (days as unknown as { day: string; n: number }[]);
  const max = Math.max(1, ...dayRows.map((r) => Number(r.n)));

  return (
    <>
      <PageHeader title="Dashboard" description="Last 7 days" actions={<ButtonLink href="/inbox">Open inbox</ButtonLink>} />
      <div className="space-y-6 p-6">
        {sp.denied && <Alert tone="danger">You don&apos;t have permission to open that page. Ask an owner or admin.</Alert>}
        {role !== "agent" && !hidden && <GetStarted cookie={hideCookie} steps={steps} />}
        <div className="grid grid-cols-2 gap-x-8 gap-y-8 lg:grid-cols-4">
          <Stat label="Enquiries" value={total} hint={`${botShare}% answered by bot`} />
          <Stat label="Avg first human reply" value={duration(enq.avgFirst ? Math.round(Number(enq.avgFirst)) : null)} hint={`${Number(enq.waiting)} still waiting`} />
          <Stat label="Open conversations" value={Number(convs.open)} hint={`${Number(convs.unassigned)} unassigned`} />
          <Stat label="Open tickets" value={Number(tix.open)} />
          <Stat label="Open pipeline" value={formatMoney(Number(leadsOpen.value))} hint={`${Number(leadsOpen.n)} leads`} />
          <Stat label="Won this week" value={formatMoney(Number(won.value))} hint={`${Number(won.n)} deals`} accent />
          <Stat label="Messages in" value={Number(msgs.inbound)} />
          <Stat label="Messages out" value={Number(msgs.outbound)} />
        </div>
        <Card className="p-5">
          <h2 className="mb-4 type-heading">Customer messages per day</h2>
          {dayRows.length === 0 ? (
            <p className="text-sm text-muted">No messages yet this week.</p>
          ) : (
            <div className="flex h-40 items-end gap-3" role="img" aria-label="Bar chart of inbound messages per day">
              {dayRows.map((r) => (
                <div key={r.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className={`text-xs tabular-nums ${Number(r.n) === max ? "text-accent-text" : "text-muted"}`}>{Number(r.n)}</span>
                  <div className={`w-full ${Number(r.n) === max ? "bg-accent" : "bg-ink/80"}`} style={{ height: `${(Number(r.n) / max) * 120}px` }} />
                  <span className="section-label text-xs text-faint">{r.day}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
