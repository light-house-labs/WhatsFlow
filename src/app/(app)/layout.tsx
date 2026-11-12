import Link from "next/link";
import { eq, and, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { Sidebar } from "./sidebar";
import { Shell } from "./shell";
import { CommandPaletteProvider } from "@/components/command-palette";
import { HelpProvider } from "@/components/help-drawer";
import { nowMs } from "@/lib/format";
import { TRIAL_DAYS } from "@/lib/org-setup";
import { vapidPublicKey } from "@/lib/push";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const { db: d, org, user, role } = ctx;
  const [orgs, waiting, sandbox] = await Promise.all([
    d
      .select({ id: schema.orgs.id, name: schema.orgs.name })
      .from(schema.memberships)
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
      .where(eq(schema.memberships.userId, user.id)),
    d
      .select({ n: sql<number>`count(*)` })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.orgId, org.id), eq(schema.conversations.status, "open"), sql`${schema.conversations.unreadCount} > 0`)),
    d
      .select({ id: schema.waNumbers.id })
      .from(schema.waNumbers)
      .where(and(eq(schema.waNumbers.orgId, org.id), eq(schema.waNumbers.provider, "sandbox")))
      .limit(1),
  ]);
  const trialDaysLeft =
    org.billingStatus === "trialing" && org.currentPeriodEnd
      ? Math.max(0, Math.ceil((org.currentPeriodEnd.getTime() - nowMs()) / 86400_000))
      : null;
  return (
    <HelpProvider userId={user.id}>
    <CommandPaletteProvider role={role} hasSandbox={sandbox.length > 0}>
      <div className="flex min-h-screen bg-app pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <Sidebar
          org={{ id: org.id, name: org.name }}
          orgs={orgs}
          user={{ name: user.name, email: user.email }}
          role={role}
          unread={Number(waiting[0]?.n ?? 0)}
          trialDaysLeft={trialDaysLeft}
          trialTotalDays={TRIAL_DAYS}
          hasSandbox={sandbox.length > 0}
        />
        <Shell
          mobile={{ unread: Number(waiting[0]?.n ?? 0), userId: user.id, vapidKey: vapidPublicKey() }}
          banner={
            org.billingStatus === "cancelled" ? (
              <div className="border-b border-line bg-warning-soft px-4 py-2 text-sm max-md:text-13">
                This workspace&apos;s plan has ended. Your data is safe and the inbox still works.{" "}
                <Link href="/settings/billing" className="font-medium link">
                  Choose a plan
                </Link>{" "}
                to switch broadcasts and bots back on.
              </div>
            ) : null
          }
        >
          {children}
        </Shell>
      </div>
    </CommandPaletteProvider>
    </HelpProvider>
  );
}
