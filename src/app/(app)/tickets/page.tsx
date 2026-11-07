import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Ticket } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { formatWaId } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Tickets" };

const VIEWS = { open: ["open", "pending"], resolved: ["resolved", "closed"] } as const;

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
    <Link href={href} className={`rounded-full px-3 py-1 text-xs ${on ? "bg-accent text-on-accent" : "bg-surface-2"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader title="Tickets" description="Support requests with an owner, a status and the chat that started them." />
      <div className="space-y-4 p-6">
        <div className="flex gap-1.5">
          {tab("/tickets", "Open", view === "open" && !sp.mine)}
          {tab("/tickets?mine=1", "Assigned to me", Boolean(sp.mine))}
          {tab("/tickets?view=resolved", "Resolved", view === "resolved")}
        </div>
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={<Ticket />} title="Nothing here" body="Open a ticket from any conversation in the inbox, or let a bot flow create one." />
          ) : (
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
                    <tr key={t.id} className="hover:bg-surface-2">
                      <Td className="text-muted">{t.number}</Td>
                      <Td>
                        <Link href={`/tickets/${t.id}`} className="font-medium hover:text-accent">
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
          )}
        </Card>
      </div>
    </>
  );
}
