import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { InboxSwitch } from "./inbox-switch";

export const metadata: Metadata = { title: "Inbox" };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { db: d, org, user, role } = await requireOrg();
  const [members, quickReplies, templates, numbers] = await Promise.all([
    d
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, org.id)),
    d.select({ shortcut: schema.quickReplies.shortcut, body: schema.quickReplies.body }).from(schema.quickReplies).where(eq(schema.quickReplies.orgId, org.id)),
    d
      .select({ id: schema.templates.id, name: schema.templates.name, body: schema.templates.body, category: schema.templates.category })
      .from(schema.templates)
      .where(and(eq(schema.templates.orgId, org.id), eq(schema.templates.status, "approved"))),
    d.select({ provider: schema.waNumbers.provider, status: schema.waNumbers.status }).from(schema.waNumbers).where(eq(schema.waNumbers.orgId, org.id)),
  ]);
  const hasRealNumber = numbers.some((n) => n.provider !== "sandbox" && n.status !== "disconnected");
  return <InboxSwitch me={user.id} members={members} quickReplies={quickReplies} templates={templates} initialId={c ?? null} hasRealNumber={hasRealNumber} isAdmin={role !== "agent"} />;
}
