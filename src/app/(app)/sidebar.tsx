"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Code2,
  Database,
  LineChart,
  Package,
  ShoppingBag,
  Sparkles,
  Wallet,
  Workflow,
  CreditCard,
  FileText,
  Inbox,
  KanbanSquare,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessageCircleQuestion,
  Phone,
  Settings,
  Smartphone,
  Ticket,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cx } from "@/components/ui";
import { logout, switchOrg } from "../(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: true },
  { href: "/enquiries", label: "Enquiries", icon: MessageCircleQuestion },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/catalog", label: "Catalog", icon: Package },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/bots", label: "Bot flows", icon: Bot },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/analytics", label: "Analytics", icon: LineChart, admin: true },
];

const SETTINGS = [
  { href: "/settings/whatsapp", label: "WhatsApp numbers", icon: Phone },
  { href: "/settings", label: "Inbox settings", icon: Settings, exact: true },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/ai", label: "AI replies", icon: Sparkles },
  { href: "/settings/payments", label: "Payments", icon: Wallet },
  { href: "/settings/developers", label: "API & webhooks", icon: Code2 },
  { href: "/settings/data", label: "Your data", icon: Database },
  { href: "/settings/billing", label: "Plan & billing", icon: CreditCard },
];

type Props = {
  org: { id: string; name: string };
  orgs: { id: string; name: string }[];
  user: { name: string; email: string };
  role: string;
  unread: number;
  numbers: { id: string; label: string; provider: string; status: string }[];
  trialDaysLeft: number | null;
};

export function Sidebar({ org, orgs, user, role, unread, numbers, trialDaysLeft }: Props) {
  const path = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
  const hasSandbox = numbers.some((n) => n.provider === "sandbox");
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>
      <div className="px-3">
        {orgs.length > 1 ? (
          <form action={switchOrg}>
            <select
              name="orgId"
              defaultValue={org.id}
              aria-label="Workspace"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-9 w-full rounded-md border border-line bg-surface-2 px-2 text-sm"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <div className="truncate rounded-md bg-surface-2 px-3 py-2 text-sm font-medium">{org.name}</div>
        )}
      </div>
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {NAV.filter((n) => role !== "agent" || !("admin" in n)).map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
              active(href) ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-surface-2",
            )}
          >
            <Icon size={16} aria-hidden />
            <span className="flex-1">{label}</span>
            {badge && unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-on-accent">{unread}</span>}
          </Link>
        ))}
        <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Settings</div>
        {SETTINGS.filter((s) => role !== "agent" || s.href === "/settings").map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
              active(href, exact) ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-surface-2",
            )}
          >
            <Icon size={16} aria-hidden />
            {label}
          </Link>
        ))}
        {hasSandbox && (
          <Link
            href="/sandbox"
            className={cx("mt-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm", active("/sandbox") ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-2")}
          >
            <Smartphone size={16} aria-hidden /> Sandbox phone
          </Link>
        )}
      </nav>
      {trialDaysLeft !== null && (
        <Link href="/settings/billing" className="mx-3 mb-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
          Trial: <strong className="text-ink">{trialDaysLeft} days left</strong> · no card on file
        </Link>
      )}
      <Link href="/support" className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-2">
        <LifeBuoy size={16} aria-hidden /> Talk to a person
      </Link>
      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted">
            {user.email} · {role}
          </div>
        </div>
        <form action={logout}>
          <button className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Log out" title="Log out">
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}
