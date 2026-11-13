"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { navIcon, navItem } from "@/components/ui";
import { SearchButton } from "@/components/command-palette";
import { Group, Row, RowIcon } from "@/components/mobile/grouped";
import { GROUPS, visibleGroups } from "./settings-groups";

export const LAST_APP_ROUTE = "wf:last-app-route";

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

/** Phone: the settings pages as grouped rows, reached from More. */
export function SettingsIndex({ role, hasSandbox, children }: { role: string; hasSandbox: boolean; children?: React.ReactNode }) {
  return (
    <>
      {children}
      {visibleGroups(role, hasSandbox).map((g) => (
        <Group key={g.label} title={g.label}>
          {g.items.map(({ href, label, icon: Icon }) => (
            <Row
              key={href}
              href={href}
              title={label}
              leading={
                <RowIcon>
                  <Icon />
                </RowIcon>
              }
            />
          ))}
        </Group>
      ))}
    </>
  );
}

/** 56px top bar: "Settings / <page>". The phone shell has its own header, so it's hidden there. */
export function SettingsTopbar() {
  const path = usePathname();
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-line bg-app px-8 text-sm max-md:hidden">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2">
        <span className="text-muted">Settings</span>
        <span aria-hidden className="text-faint">/</span>
        <h1 className="font-semibold text-ink">{settingsPageLabel(path)}</h1>
      </nav>
    </div>
  );
}
