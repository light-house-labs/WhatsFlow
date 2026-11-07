import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { InboxApp } from "./inbox-app";

export const metadata: Metadata = { title: "Inbox" };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { db: d, org, user } = await requireOrg();
  const [members, quickReplies, templates] = await Promise.all([
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
  ]);
  return <InboxApp me={user.id} members={members} quickReplies={quickReplies} templates={templates} initialId={c ?? null} />;
}
