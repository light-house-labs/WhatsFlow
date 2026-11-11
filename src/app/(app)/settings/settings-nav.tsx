"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Code2,
  CreditCard,
  Database,
  History,
  Inbox,

  Plug,
  Route,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { navIcon, navItem } from "@/components/ui";
import { SearchButton } from "@/components/command-palette";

type NavLink = { href: string; label: string; icon: LucideIcon; exact?: boolean; admin?: boolean; sandbox?: boolean };

const GROUPS: { label: string; items: NavLink[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Inbox", icon: Inbox, exact: true },
      { href: "/settings/team", label: "Team", icon: Users, admin: true },
      { href: "/settings/routing", label: "Chat routing", icon: Route, admin: true },
    ],
  },
  {
    label: "Channels",
    items: [
      { href: "/settings/whatsapp", label: "WhatsApp numbers", icon: Smartphone, admin: true },
      { href: "/settings/sandbox", label: "Sandbox phone", icon: Phone, sandbox: true },
    ],
  },
  { label: "AI", items: [{ href: "/settings/ai", label: "AI replies", icon: Sparkles, admin: true }] },
  {
    label: "Integrations",
    items: [
      { href: "/settings/payments", label: "Payments", icon: Wallet, admin: true },
      { href: "/settings/integrations", label: "Connected apps", icon: Plug, admin: true },
      { href: "/settings/developers", label: "API & webhooks", icon: Code2, admin: true },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings/billing", label: "Plan & billing", icon: CreditCard, admin: true },
      { href: "/settings/data", label: "Your data", icon: Database, admin: true },
      { href: "/settings/audit", label: "Audit log", icon: History, admin: true },
    ],
  },
];

export const LAST_APP_ROUTE = "wf:last-app-route";

function visibleGroups(role: string, hasSandbox: boolean) {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((l) => (role !== "agent" || !l.admin) && (!l.sandbox || hasSandbox)),
  })).filter((g) => g.items.length);
}

/** Label of the settings page at `path`, for the breadcrumb. */
export function settingsPageLabel(path: string) {
  const all = GROUPS.flatMap((g) => g.items);
  const hit = all.filter((l) => (l.exact ? path === l.href : path === l.href || path.startsWith(l.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.label ?? "Settings";
}

/** Replaces the main sidebar on /settings/*: same width, tint and item styles. */
export function SettingsSidebar({ orgName, role, hasSandbox }: { orgName: string; role: string; hasSandbox: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const groups = visibleGroups(role, hasSandbox);
  const back = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    let to = "/dashboard";
    try {
      to = sessionStorage.getItem(LAST_APP_ROUTE) || to;
    } catch {}
    router.push(to);
  };
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-app text-ink">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-2">
        <Link href="/dashboard" onClick={back} className="flex h-[34px] flex-1 items-center gap-2.5 rounded-md px-2 text-13 text-muted transition-surface hover:bg-hover hover:text-ink">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
          Back to app
        </Link>
      </div>
      <div className="shrink-0 px-2 pt-3">
        <SearchButton />
      </div>
      <div className="truncate px-4 pb-1 pt-4 text-sm font-semibold" title={orgName}>
        {orgName}
      </div>
      <nav aria-label="Settings" className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.map((g) => (
          <div key={g.label} className="pt-4">
            <div className="section-label px-2 pb-1.5 text-faint">{g.label}</div>
            {g.items.map(({ href, label, icon: Icon, exact }) => {
              const on = exact ? path === href : path === href || path.startsWith(href + "/");
              return (
                <Link key={href} href={href} aria-current={on ? "page" : undefined} className={navItem(on)}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden className={navIcon(on)} />
                  <span className="flex-1 truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

/** 56px top bar: "Settings / <page>". */
export function SettingsTopbar() {
  const path = usePathname();
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-line bg-app px-8 text-sm">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2">
        <span className="text-muted">Settings</span>
        <span aria-hidden className="text-faint">/</span>
        <h1 className="font-semibold text-ink">{settingsPageLabel(path)}</h1>
      </nav>
    </div>
  );
}
