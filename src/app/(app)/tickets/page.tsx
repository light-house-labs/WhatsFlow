import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Ticket } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th, filterChip, segmentedTrack } from "@/components/ui";
import { ChipBar, ChipLink, DesktopOnly, Group, GroupEmpty, MobileOnly, MobileScreen, Row, groupBy } from "@/components/mobile/grouped";

export const metadata: Metadata = { title: "Tickets" };

const VIEWS = { open: ["open", "pending"], resolved: ["resolved", "closed"] } as const;

const COLS = ["#", "Subject", "Customer", "Priority", "Status", "Assignee", "Due", "Opened"];

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: "open" | "resolved"; mine?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "resolved" ? "resolved" : "open";
  const { db: d, org, user } = await requireOrg();
  const where = [eq(schema.tickets.orgId, org.id), inArray(schema.tickets.status, [...VIEWS[view]])];
  if (sp.mine) where.push(eq(schema.tickets.assigneeId, user.id));
  const rows = await d
    .select({ t: schema.tickets, name: schema.contacts.name, waId: schema.contacts.waId, assignee: schema.users.name })
    .from(schema.tickets)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.tickets.contactId))
    .leftJoin(schema.users, eq(schema.users.id, schema.tickets.assigneeId))
    .where(and(...where))
    .orderBy(desc(schema.tickets.createdAt))
    .limit(200);
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={filterChip(on)}>
      {label}
    </Link>
  );
  const groupLabel: Record<string, string> = { open: "Open", pending: "Waiting on customer", resolved: "Resolved", closed: "Closed" };
  return (
    <>
      <MobileOnly>
        <MobileScreen>
          <ChipBar>
            <ChipLink href="/tickets" on={view === "open" && !sp.mine}>
              Open
            </ChipLink>
            <ChipLink href="/tickets?mine=1" on={Boolean(sp.mine)}>
              Assigned to me
            </ChipLink>
            <ChipLink href="/tickets?view=resolved" on={view === "resolved"}>
              Resolved
            </ChipLink>
          </ChipBar>
          {rows.length === 0 ? (
            <GroupEmpty
              icon={<Ticket />}
              title={sp.mine || view === "resolved" ? "No matches" : "No tickets yet"}
              description={sp.mine || view === "resolved" ? "Nothing in this view." : "Open a ticket from any conversation: tap + and choose New ticket."}
            />
          ) : (
            groupBy(rows, ({ t }) => t.status).map(([status, items]) => (
              <Group key={status} title={groupLabel[status] ?? status}>
                {items.map(({ t, name, waId, assignee }) => {
                  const overdue = t.dueAt && t.dueAt < new Date() && view === "open";
                  return (
                    <Row
                      key={t.id}
                      href={`/tickets/${t.id}`}
                      title={t.subject}
                      meta={
                        <>
                          #{t.number} · {name ?? formatWaId(waId)} · {assignee ?? "Unassigned"}
                          {t.dueAt && <span className={overdue ? "font-medium text-danger" : undefined}> · due {t.dueAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                        </>
                      }
                      trailing={t.priority !== "normal" ? <StatusBadge status={t.priority} /> : <span className="text-13 text-faint">{timeAgo(t.createdAt)}</span>}
                    />
                  );
                })}
              </Group>
            ))
          )}
        </MobileScreen>
      </MobileOnly>
      <DesktopOnly>
      <PageHeader title="Tickets" description="Support requests with an owner, a status and the chat that started them." />
      <div className="space-y-4 p-6">
        <div className={segmentedTrack}>
          {tab("/tickets", "Open", view === "open" && !sp.mine)}
          {tab("/tickets?mine=1", "Assigned to me", Boolean(sp.mine))}
          {tab("/tickets?view=resolved", "Resolved", view === "resolved")}
        </div>
        {rows.length === 0 ? (
sp.mine || view === "resolved" ? (
            <EmptyState variant="filtered" columns={COLS} primary={{ href: "/tickets" }} />
          ) : (
            <EmptyState
              icon={<Ticket />}
              columns={COLS}
              title="No tickets yet"
              description="Track a customer problem from first message to resolved, with an owner and a due date."
              primary={{ label: "New ticket", href: "/inbox" }}
              hint={
                <>
                  Open a ticket from any conversation in the <Link href="/inbox">inbox</Link>, or let a <Link href="/bots">bot flow</Link> create one.
                </>
              }
            />
          )
) : (
<Card>
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Subject</Th>
                  <Th>Customer</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Assignee</Th>
                  <Th>Due</Th>
                  <Th>Opened</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, name, waId, assignee }) => {
                  const overdue = t.dueAt && t.dueAt < new Date() && view === "open";
                  return (
                    <tr key={t.id} className="hover:bg-hover">
                      <Td className="text-muted">{t.number}</Td>
                      <Td>
                        <Link href={`/tickets/${t.id}`} className="font-medium hover:underline">
                          {t.subject}
                        </Link>
                      </Td>
                      <Td>{name ?? formatWaId(waId)}</Td>
                      <Td>
                        <StatusBadge status={t.priority} />
                      </Td>
                      <Td>
                        <StatusBadge status={t.status} />
                      </Td>
                      <Td className="text-muted">{assignee ?? "—"}</Td>
                      <Td className={overdue ? "font-medium text-danger" : "text-muted"}>{t.dueAt ? t.dueAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</Td>
                      <Td className="text-muted">{timeAgo(t.createdAt)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
)}
      </div>
      </DesktopOnly>
    </>
  );
}
