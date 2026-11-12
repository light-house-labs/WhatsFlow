import { Inbox, LayoutGrid, ShoppingBag, Users, type LucideIcon } from "lucide-react";

export type TabId = "inbox" | "sales" | "contacts" | "more";
export type Tab = { id: TabId; href: string; label: string; icon: LucideIcon };

export const TABS: Tab[] = [
  { id: "inbox", href: "/inbox", label: "Inbox", icon: Inbox },
  { id: "sales", href: "/pipeline", label: "Sales", icon: ShoppingBag },
  { id: "contacts", href: "/contacts", label: "Contacts", icon: Users },
  { id: "more", href: "/more", label: "More", icon: LayoutGrid },
];

/** The four Sales segments; each is an existing route. */
export const SALES = [
  { href: "/pipeline", label: "Pipeline" },
  { href: "/orders", label: "Orders" },
  { href: "/appointments", label: "Bookings" },
  { href: "/tickets", label: "Tickets" },
] as const;

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

export function tabFor(path: string): TabId {
  if (under(path, "/inbox") || under(path, "/enquiries")) return "inbox";
  if (SALES.some((s) => under(path, s.href))) return "sales";
  if (under(path, "/contacts")) return "contacts";
  return "more";
}

/**
 * How the shell frames a route on a phone:
 * - root: tab screen, large collapsing title, search and "+".
 * - push: detail screen, back button and a compact title; tab bar stays.
 * - form: full screen (forms, pickers, editors), back button, no tab bar. The page brings a sticky action bar.
 * - full: the screen draws its own header (chat), no shell chrome at all.
 */
export type Mode = "root" | "push" | "form" | "full";

const ROOTS = ["/inbox", "/pipeline", "/orders", "/appointments", "/tickets", "/contacts", "/more"];

export function modeFor(path: string, search: URLSearchParams): Mode {
  if (path === "/inbox" && search.get("c")) return "full";
  if ((path === "/contacts" || path === "/appointments") && search.get("new")) return "form";
  if (/\/(new|import)$/.test(path) || /^\/(bots|automations)\/[^/]+$/.test(path) || /^\/contacts\/segments\/[^/]+$/.test(path)) return "form";
  if (path === "/more" && search.get("view")) return "push";
  if (ROOTS.includes(path)) return "root";
  return "push";
}

export function rootTitle(path: string): string {
  const tab = tabFor(path);
  return tab === "sales" ? "Sales" : TABS.find((t) => t.id === tab)!.label;
}

/** Where the back button goes when there is no in-app history to pop (opened from a notification or a link). */
export function parentOf(path: string, search: URLSearchParams): string {
  if (path === "/inbox") return "/inbox";
  if ((path === "/contacts" || path === "/appointments") && search.get("new")) return path;
  if (path === "/more") return "/more";
  if (under(path, "/settings")) return "/more?view=settings";
  const parts = path.split("/").filter(Boolean);
  if (parts.length > 1) return "/" + parts.slice(0, -1).join("/");
  return "/more";
}
