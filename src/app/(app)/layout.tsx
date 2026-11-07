import Link from "next/link";
import { eq, and, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { Sidebar } from "./sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const { db: d, org, user, role } = ctx;
  const [orgs, numbers, waiting] = await Promise.all([
    d
      .select({ id: schema.orgs.id, name: schema.orgs.name })
      .from(schema.memberships)
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
      .where(eq(schema.memberships.userId, user.id)),
    d.select().from(schema.waNumbers).where(eq(schema.waNumbers.orgId, org.id)),
    d
      .select({ n: sql<number>`count(*)` })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.orgId, org.id), eq(schema.conversations.status, "open"), sql`${schema.conversations.unreadCount} > 0`)),
  ]);
  const trialDaysLeft =
    org.billingStatus === "trialing" && org.currentPeriodEnd
      ? Math.max(0, Math.ceil((org.currentPeriodEnd.getTime() - Date.now()) / 86400_000))
      : null;
  return (
    <div className="flex min-h-screen">
      <Sidebar
        org={{ id: org.id, name: org.name }}
        orgs={orgs}
        user={{ name: user.name, email: user.email }}
        role={role}
        unread={Number(waiting[0]?.n ?? 0)}
        numbers={numbers.map((n) => ({ id: n.id, label: n.displayPhone, provider: n.provider, status: n.status }))}
        trialDaysLeft={trialDaysLeft}
      />
      <main className="min-w-0 flex-1">
        {org.billingStatus === "cancelled" && (
          <div className="border-b border-line bg-surface-2 px-6 py-2 text-sm">
            This workspace&apos;s plan has ended. Your data is safe and the inbox still works.{" "}
            <Link href="/settings/billing" className="font-medium text-accent">
              Choose a plan
            </Link>{" "}
            to switch broadcasts and bots back on.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
