"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  LineChart,
  Package,
  ShoppingBag,
  Workflow,
  FileText,
  Inbox,
  KanbanSquare,
  LifeBuoy,
  LogOut,
  Moon,
  Sun,
  ChevronsUpDown,
  Check,
  MoreHorizontal,
  Megaphone,
  MessageCircleQuestion,
  Settings,
  Ticket,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar, cx, navIcon, navItem } from "@/components/ui";
import { SearchButton } from "@/components/command-palette";
import { logout, switchOrg } from "../(auth)/actions";
import { LAST_APP_ROUTE, SettingsSidebar } from "./settings/settings-nav";

type NavItem = { href: string; label: string; icon: typeof BarChart3; badge?: boolean; admin?: boolean };

const TOP: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/analytics", label: "Analytics", icon: LineChart, admin: true },
];

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Conversations",
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox, badge: true },
      { href: "/enquiries", label: "Enquiries", icon: MessageCircleQuestion },
      { href: "/tickets", label: "Tickets", icon: Ticket },
      { href: "/contacts", label: "Contacts", icon: Users },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
      { href: "/orders", label: "Orders", icon: ShoppingBag },
      { href: "/catalog", label: "Catalog", icon: Package },
      { href: "/appointments", label: "Appointments", icon: CalendarDays },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/templates", label: "Templates", icon: FileText },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/bots", label: "Bot flows", icon: Bot },
      { href: "/automations", label: "Automations", icon: Workflow },
    ],
  },
];

type Props = {
  org: { id: string; name: string };
  orgs: { id: string; name: string }[];
  user: { name: string; email: string };
  role: string;
  unread: number;
  trialDaysLeft: number | null;
  trialTotalDays: number;
  hasSandbox: boolean;
};

const item = navItem;
const icon = navIcon;

export function Sidebar({ org, orgs, user, role, unread, trialDaysLeft, trialTotalDays, hasSandbox }: Props) {
  const path = usePathname();
  const inSettings = path === "/settings" || path.startsWith("/settings/");
  useEffect(() => {
    if (inSettings) return;
    try {
      sessionStorage.setItem(LAST_APP_ROUTE, path + window.location.search);
    } catch {}
  }, [inSettings, path]);
  if (inSettings)
    return (
      <div className="contents max-md:hidden">
        <SettingsSidebar orgName={org.name} role={role} hasSandbox={hasSandbox} />
      </div>
    );
  const active = (href: string) => path === href || path.startsWith(href + "/");
  // Tablet (768-1023): a 64px icon rail; the labels stay for screen readers. Phones use the bottom tab bar instead.
  const rail = (on: boolean) => cx(item(on), "relative md:max-lg:justify-center md:max-lg:px-0");
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-app text-ink max-md:hidden md:max-lg:w-16">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 md:max-lg:justify-center">
        <Link href="/dashboard" aria-label="WhatsFlow home" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-hover">
          <Logo compact />
        </Link>
        <div className="contents md:max-lg:hidden">
          <WorkspaceSwitcher org={org} orgs={orgs} />
        </div>
      </div>
      <div className="shrink-0 px-2 pt-3">
        <SearchButton />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {[{ label: "", items: TOP }, ...GROUPS].map((g) => {
          const items = g.items.filter((n) => role !== "agent" || !n.admin);
          if (!items.length) return null;
          return (
            <div key={g.label || "top"} className={g.label ? "pt-4" : undefined}>
              {g.label && <div className="section-label px-2 pb-1.5 text-faint md:max-lg:sr-only">{g.label}</div>}
              {items.map(({ href, label, icon: Icon, badge }) => (
                <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={rail(active(href))}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden className={icon(active(href))} />
                  <span className="flex-1 md:max-lg:sr-only">{label}</span>
                  {badge && unread > 0 && <span className="count-badge md:max-lg:absolute md:max-lg:-top-1 md:max-lg:right-0.5">{unread}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line px-2 py-2">
        <Link href="/settings" aria-current={active("/settings") ? "page" : undefined} className={rail(active("/settings"))}>
          <Settings size={16} strokeWidth={1.75} aria-hidden className={icon(active("/settings"))} />
          <span className="flex-1 md:max-lg:sr-only">Settings</span>
        </Link>
        <Link href="/support" aria-current={active("/support") ? "page" : undefined} className={rail(active("/support"))}>
          <LifeBuoy size={16} strokeWidth={1.75} aria-hidden className={icon(active("/support"))} />
          <span className="flex-1 md:max-lg:sr-only">Talk to a person</span>
        </Link>
      </div>
      <div className="flex flex-col gap-3 border-t border-line p-3">
        {trialDaysLeft !== null && (
          <Link href="/settings/billing" className="block rounded-lg border border-line bg-surface p-3 transition-surface hover:bg-hover md:max-lg:hidden">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-ink tabular-nums">{trialDaysLeft} days left</span>
              <span className="text-faint">Free trial</span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-fill-strong"
              role="progressbar"
              aria-label="Trial progress"
              aria-valuemin={0}
              aria-valuemax={trialTotalDays}
              aria-valuenow={Math.max(0, trialTotalDays - trialDaysLeft)}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, ((trialTotalDays - trialDaysLeft) / trialTotalDays) * 100))}%` }} />
            </div>
          </Link>
        )}
        <UserRow name={user.name} role={role} />
      </div>
    </aside>
  );
}

function WorkspaceSwitcher({ org, orgs }: { org: { id: string; name: string }; orgs: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${org.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-left shadow-xs transition-surface hover:bg-hover"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{org.name}</span>
        <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
      </button>
      {open && (
        <form action={switchOrg} className="absolute left-0 top-full z-20 mt-1 w-full min-w-52 rounded-lg bg-surface p-1 shadow-menu" role="menu">
          <div className="section-label px-2 pb-1 pt-1.5 text-faint">Workspaces</div>
          {orgs.map((o) => (
            <button
              key={o.id}
              name="orgId"
              value={o.id}
              role="menuitemradio"
              aria-checked={o.id === org.id}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-13 text-ink transition-surface hover:bg-fill"
            >
              <span className="min-w-0 flex-1 truncate text-left">{o.name}</span>
              {o.id === org.id && <Check size={14} strokeWidth={1.75} aria-hidden className="text-accent" />}
            </button>
          ))}
        </form>
      )}
    </div>
  );
}

function UserRow({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative flex items-center gap-2.5 md:max-lg:flex-col md:max-lg:gap-1">
      <Avatar name={name} size={32} />
      <div className="min-w-0 flex-1 md:max-lg:sr-only">
        <div className="truncate text-13 font-medium leading-4">{name}</div>
        <div className="truncate text-xs leading-4 text-faint capitalize">{role}</div>
      </div>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-md text-muted transition-surface hover:bg-fill hover:text-ink"
      >
        <MoreHorizontal size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-44 rounded-lg bg-surface p-1 shadow-menu md:max-lg:right-auto md:max-lg:left-0" role="menu">
          <div className="section-label px-2.5 pb-1 pt-1.5 text-faint">Theme</div>
          {([["light", "Light", Sun], ["dark", "Dark", Moon]] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={(theme ?? "light") === value}
              onClick={() => setTheme(value)}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-13 text-ink transition-surface hover:bg-fill"
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden className="text-faint" />
              <span className="flex-1 text-left">{label}</span>
              <span
                aria-hidden
                className={cx("size-3.5 rounded-full border", (theme ?? "light") === value ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--wf-surface)]" : "border-line-strong")}
              />
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <form action={logout}>
            <button role="menuitem" className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-13 text-ink transition-surface hover:bg-fill">
              <LogOut size={14} strokeWidth={1.75} aria-hidden className="text-faint" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
