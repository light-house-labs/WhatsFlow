import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { rowsOf, schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { duration, nowMs } from "@/lib/format";
import { formatMoney } from "@/lib/plans";
import { Card, PageHeader, Stat, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [7, 30, 90] as const;

type Mate = { id: string; name: string; replies: number; chats: number; avg_first: number | null; tickets_resolved: number; won_value: number };

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string; user?: string }> }) {
  const sp = await searchParams;
  const { db: d, org } = await requireOrg("admin");
  const days = RANGES.includes(Number(sp.days) as 7) ? Number(sp.days) : 30;
  const since = new Date(nowMs() - days * 86400_000).toISOString();
  const o = org.id;
  const team = await d
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, o));
  const user = team.find((t) => t.id === sp.user)?.id ?? null;
  // Each block optionally narrows to one teammate.
  const byUser = (col: string) => (user ? sql`and ${sql.raw(col)} = ${user}` : sql``);

  const [[chats], [first], [resolution], sources, [leads], [orders], [bookings], mates] = await Promise.all([
    d.execute<{ total: number; bot: number }>(sql`
      select count(*)::int as total, count(*) filter (where status = 'answered_by_bot')::int as bot
      from enquiries e where org_id = ${o} and created_at >= ${since}::timestamptz
        ${user ? sql`and exists (select 1 from conversations c where c.id = e.conversation_id and c.assignee_id = ${user})` : sql``}`).then(rowsOf<{ total: number; bot: number }>),
    d.execute<{ avg: number | null; p50: number | null }>(sql`
      select avg(first_response_seconds)::int as avg, percentile_cont(0.5) within group (order by first_response_seconds)::int as p50
      from enquiries e where org_id = ${o} and created_at >= ${since}::timestamptz and first_response_seconds > 0
        ${user ? sql`and exists (select 1 from conversations c where c.id = e.conversation_id and c.assignee_id = ${user})` : sql``}`).then(rowsOf<{ avg: number | null; p50: number | null }>),
    d.execute<{ tickets: number | null; chats: number | null }>(sql`
      select
        (select avg(extract(epoch from resolved_at - created_at))::int from tickets where org_id = ${o} and resolved_at >= ${since}::timestamptz ${byUser("assignee_id")}) as tickets,
        (select avg(extract(epoch from closed_at - created_at))::int from conversations where org_id = ${o} and closed_at >= ${since}::timestamptz ${byUser("assignee_id")}) as chats`).then(rowsOf<{ tickets: number | null; chats: number | null }>),
    d.execute<{ source: string; enquiries: number; leads: number; won: number }>(sql`
      select s.source, coalesce(e.n,0)::int as enquiries, coalesce(l.n,0)::int as leads, coalesce(l.won,0)::int as won from
        (select source from enquiries where org_id = ${o} and created_at >= ${since}::timestamptz union select source from leads where org_id = ${o} and created_at >= ${since}::timestamptz) s
        left join (select source, count(*) n from enquiries where org_id = ${o} and created_at >= ${since}::timestamptz group by source) e on e.source = s.source
        left join (select l.source, count(*) n, coalesce(sum(l.value_minor) filter (where ps.kind = 'won'),0) won from leads l join pipeline_stages ps on ps.id = l.stage_id
                   where l.org_id = ${o} and l.created_at >= ${since}::timestamptz ${byUser("l.owner_id")} group by l.source) l on l.source = s.source
      order by enquiries desc`).then(rowsOf<{ source: string; enquiries: number; leads: number; won: number }>),
    d.execute<{ created: number; won: number; won_value: number }>(sql`
      select count(*)::int as created, count(*) filter (where ps.kind = 'won')::int as won, coalesce(sum(l.value_minor) filter (where ps.kind = 'won'),0)::bigint as won_value
      from leads l join pipeline_stages ps on ps.id = l.stage_id where l.org_id = ${o} and l.created_at >= ${since}::timestamptz ${byUser("l.owner_id")}`).then(rowsOf<{ created: number; won: number; won_value: number }>),
    d.execute<{ n: number; paid: number; revenue: number }>(sql`
      select count(*)::int as n, count(*) filter (where payment_status = 'paid')::int as paid, coalesce(sum(total_minor) filter (where payment_status = 'paid'),0)::bigint as revenue
      from orders where org_id = ${o} and created_at >= ${since}::timestamptz`).then(rowsOf<{ n: number; paid: number; revenue: number }>),
    d.execute<{ n: number; no_show: number; via_whatsapp: number }>(sql`
      select count(*)::int as n, count(*) filter (where status = 'no_show')::int as no_show, count(*) filter (where source in ('bot','reschedule'))::int as via_whatsapp
      from appointments where org_id = ${o} and created_at >= ${since}::timestamptz and status <> 'cancelled'`).then(rowsOf<{ n: number; no_show: number; via_whatsapp: number }>),
    d.execute<Mate>(sql`
      select u.id, u.name,
        (select count(*) from messages m where m.org_id = ${o} and m.sender_user_id = u.id and m.created_at >= ${since}::timestamptz)::int as replies,
        (select count(distinct m.conversation_id) from messages m where m.org_id = ${o} and m.sender_user_id = u.id and m.created_at >= ${since}::timestamptz)::int as chats,
        (select avg(e.first_response_seconds)::int from enquiries e join conversations c on c.id = e.conversation_id
           where e.org_id = ${o} and c.assignee_id = u.id and e.created_at >= ${since}::timestamptz and e.first_response_seconds > 0) as avg_first,
        (select count(*) from tickets t where t.org_id = ${o} and t.assignee_id = u.id and t.resolved_at >= ${since}::timestamptz)::int as tickets_resolved,
        (select coalesce(sum(l.value_minor),0) from leads l join pipeline_stages ps on ps.id = l.stage_id
           where l.org_id = ${o} and l.owner_id = u.id and ps.kind = 'won' and l.updated_at >= ${since}::timestamptz)::bigint as won_value
      from memberships mb join users u on u.id = mb.user_id where mb.org_id = ${o} order by replies desc`).then(rowsOf<Mate>),
  ]);
  // Click to WhatsApp ads: chats each ad started, and what those people went on to buy.
  type AdRow = { ad_id: string; headline: string | null; url: string | null; chats: number; leads: number; paid_orders: number; revenue: number };
  const ads = await d
    .execute<AdRow>(sql`
      with e as (
        select distinct on (contact_id, ad->>'sourceId') contact_id, ad->>'sourceId' as ad_id, ad->>'headline' as headline, ad->>'sourceUrl' as url, created_at
        from enquiries where org_id = ${o} and ad is not null and created_at >= ${since}::timestamptz
        order by contact_id, ad->>'sourceId', created_at
      )
      select coalesce(e.ad_id, 'unknown') as ad_id, max(e.headline) as headline, max(e.url) as url, count(*)::int as chats,
        count(*) filter (where exists (select 1 from leads l where l.contact_id = e.contact_id and l.created_at >= e.created_at))::int as leads,
        coalesce(sum((select count(*) from orders x where x.contact_id = e.contact_id and x.payment_status = 'paid' and x.created_at >= e.created_at)),0)::int as paid_orders,
        coalesce(sum((select sum(x.total_minor) from orders x where x.contact_id = e.contact_id and x.payment_status = 'paid' and x.created_at >= e.created_at)),0)::bigint as revenue
      from e group by coalesce(e.ad_id, 'unknown') order by chats desc limit 20`)
    .then(rowsOf<AdRow>);
  const total = Number(chats.total);
  const link = (q: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { days, user, ...q };
    if (merged.days !== 30) p.set("days", String(merged.days));
    if (merged.user) p.set("user", String(merged.user));
    const s = p.toString();
    return `/analytics${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <PageHeader title="Analytics" description={`Last ${days} days${user ? ` · ${team.find((t) => t.id === user)?.name}` : ""}`} />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <Link key={r} href={link({ days: r })} className={`rounded-full px-3 py-1 text-xs ${days === r ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
              {r} days
            </Link>
          ))}
          <span className="mx-2 text-muted">|</span>
          <Link href={link({ user: null })} className={`rounded-full px-3 py-1 text-xs ${!user ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
            Whole team
          </Link>
          {team.map((t) => (
            <Link key={t.id} href={link({ user: t.id })} className={`rounded-full px-3 py-1 text-xs ${user === t.id ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
              {t.name}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Chats started" value={total} hint={`${total ? Math.round((Number(chats.bot) / total) * 100) : 0}% answered by bot or AI`} />
          <Stat label="First reply (average)" value={duration(first.avg)} hint={`median ${duration(first.p50)}`} />
          <Stat label="Time to close a chat" value={duration(resolution.chats)} hint={`tickets: ${duration(resolution.tickets)}`} />
          <Stat label="Leads won" value={formatMoney(Number(leads.won_value))} hint={`${Number(leads.won)} of ${Number(leads.created)} leads`} />
          <Stat label="Orders" value={Number(orders.n)} hint={`${Number(orders.paid)} paid`} />
          <Stat label="Sales collected" value={formatMoney(Number(orders.revenue))} />
          <Stat label="Bookings" value={Number(bookings.n)} hint={`${Number(bookings.via_whatsapp)} booked in WhatsApp`} />
          <Stat label="No-shows" value={Number(bookings.no_show)} />
        </div>
        <Card>
          <div className="px-5 pt-4 text-sm font-semibold">By source</div>
          <Table>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Enquiries</Th>
                <Th>Leads</Th>
                <Th>Won value</Th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr>
                  <Td className="text-muted">No data yet.</Td>
                </tr>
              ) : (
                sources.map((s) => (
                  <tr key={s.source}>
                    <Td className="capitalize">{s.source === "ad" ? "Click-to-WhatsApp ad" : s.source}</Td>
                    <Td>{Number(s.enquiries)}</Td>
                    <Td>{Number(s.leads)}</Td>
                    <Td>{formatMoney(Number(s.won))}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        {ads.length > 0 && (
          <Card>
            <div className="px-5 pt-4 text-sm font-semibold">Click to WhatsApp ads</div>
            <p className="px-5 text-xs text-muted">People who tapped an ad and messaged you, and what they did next.</p>
            <Table>
              <thead>
                <tr>
                  <Th>Ad</Th>
                  <Th>Chats</Th>
                  <Th>Became leads</Th>
                  <Th>Paid orders</Th>
                  <Th>Sales</Th>
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => (
                  <tr key={a.ad_id}>
                    <Td>
                      {a.url?.startsWith("https://") ? (
                        <a href={a.url} target="_blank" rel="noreferrer noopener" className="font-medium text-ink hover:text-accent">
                          {a.headline ?? `Ad ${a.ad_id}`}
                        </a>
                      ) : (
                        <span className="font-medium">{a.headline ?? `Ad ${a.ad_id}`}</span>
                      )}
                      <div className="text-xs text-muted">ID {a.ad_id}</div>
                    </Td>
                    <Td>{Number(a.chats)}</Td>
                    <Td>{Number(a.leads)}</Td>
                    <Td>{Number(a.paid_orders)}</Td>
                    <Td>{formatMoney(Number(a.revenue))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        <Card>
          <div className="px-5 pt-4 text-sm font-semibold">Team</div>
          <Table>
            <thead>
              <tr>
                <Th>Teammate</Th>
                <Th>Replies sent</Th>
                <Th>Chats handled</Th>
                <Th>Avg first reply</Th>
                <Th>Tickets resolved</Th>
                <Th>Won value</Th>
              </tr>
            </thead>
            <tbody>
              {mates.map((m) => (
                <tr key={m.id} className={user && user !== m.id ? "opacity-50" : ""}>
                  <Td className="font-medium">{m.name}</Td>
                  <Td>{Number(m.replies)}</Td>
                  <Td>{Number(m.chats)}</Td>
                  <Td>{duration(m.avg_first)}</Td>
                  <Td>{Number(m.tickets_resolved)}</Td>
                  <Td>{formatMoney(Number(m.won_value))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <p className="text-xs text-muted">
          Download the underlying data from <Link href="/settings/data" className="text-accent">Your data</Link>.
        </p>
      </div>
    </>
  );
}
