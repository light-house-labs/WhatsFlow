import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { BarChart3, Bot, Check, FileText, LifeBuoy, LineChart, LogOut, Megaphone, MessageCircleQuestion, Package, Settings, Workflow } from "lucide-react";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";
import { Avatar } from "@/components/ui";
import { ButtonRow, Group, MobileScreen, Row, RowIcon } from "@/components/mobile/grouped";
import { logout, switchOrg } from "../../(auth)/actions";
import { SettingsIndex } from "../settings/settings-nav";
import { HelpRow, InstallRow, NotificationsToggle, ThemeRow } from "./more-client";

export const metadata: Metadata = { title: "More" };

/** The phone's fourth tab: everything that isn't Inbox, Sales or Contacts. `?view=settings` is the settings list. */
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { db: d, org, user, role } = await requireOrg();
  const admin = role !== "agent";
  const [orgs, sandbox] = await Promise.all([
    d
      .select({ id: schema.orgs.id, name: schema.orgs.name })
      .from(schema.memberships)
      .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
      .where(eq(schema.memberships.userId, user.id)),
    d
      .select({ id: schema.waNumbers.id })
      .from(schema.waNumbers)
      .where(and(eq(schema.waNumbers.orgId, org.id), eq(schema.waNumbers.provider, "sandbox")))
      .limit(1),
  ]);

  if (view === "settings")
    return (
      <MobileScreen>
        <SettingsIndex role={role} hasSandbox={sandbox.length > 0}>
          <Group title="This device">
            <NotificationsToggle vapidKey={vapidPublicKey()} />
          </Group>
        </SettingsIndex>
      </MobileScreen>
    );
  if (view) redirect("/more");

  const icon = (I: typeof BarChart3, tone?: string) => (
    <RowIcon tone={tone}>
      <I />
    </RowIcon>
  );
  return (
    <MobileScreen>
      <div className="flex items-center gap-3 rounded-xl bg-surface p-4">
        <Avatar name={user.name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{user.name}</div>
          <div className="truncate text-13 text-faint">
            {user.email} · <span className="capitalize">{role}</span>
          </div>
        </div>
      </div>

      <Group title="Insights">
        <Row href="/dashboard" title="Dashboard" meta="Last 7 days at a glance" leading={icon(BarChart3, "bg-accent-soft text-accent-text")} />
        {admin && <Row href="/analytics" title="Analytics" meta="Response times, bot share, revenue" leading={icon(LineChart, "bg-accent-soft text-accent-text")} />}
        <Row href="/enquiries" title="Enquiries" leading={icon(MessageCircleQuestion)} />
      </Group>

      <Group title="Marketing">
        <Row href="/campaigns" title="Campaigns" leading={icon(Megaphone)} />
        <Row href="/templates" title="Templates" leading={icon(FileText)} />
        <Row href="/catalog" title="Catalog" leading={icon(Package)} />
      </Group>

      <Group title="Automation">
        <Row href="/bots" title="Bot flows" leading={icon(Bot)} />
        <Row href="/automations" title="Automations" leading={icon(Workflow)} />
      </Group>

      <Group>
        <Row href="/more?view=settings" title="Settings" leading={icon(Settings)} />
        <HelpRow />
        <Row href="/support" title="Talk to a person" leading={icon(LifeBuoy)} />
        <InstallRow />
      </Group>

      {orgs.length > 0 && (
        <form action={switchOrg}>
          <Group title="Workspace">
            {orgs.map((o) => (
              <ButtonRow
                key={o.id}
                name="orgId"
                value={o.id}
                title={o.name}
                leading={<Avatar name={o.name} size={32} />}
                trailing={o.id === org.id ? <Check size={18} className="text-accent" aria-label="Current workspace" /> : undefined}
              />
            ))}
          </Group>
        </form>
      )}

      <Group>
        <ThemeRow />
      </Group>

      <form action={logout}>
        <Group>
          <ButtonRow title="Log out" danger leading={icon(LogOut, "bg-danger-soft text-danger")} />
        </Group>
      </form>
    </MobileScreen>
  );
}
