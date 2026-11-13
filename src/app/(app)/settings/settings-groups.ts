import {
  Code2,
  CreditCard,
  Database,
  History,
  Inbox,
  Phone,
  Plug,
  Route,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type NavLink = { href: string; label: string; icon: LucideIcon; exact?: boolean; admin?: boolean; sandbox?: boolean };

export const GROUPS: { label: string; items: NavLink[] }[] = [
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

export function visibleGroups(role: string, hasSandbox: boolean) {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((l) => (role !== "agent" || !l.admin) && (!l.sandbox || hasSandbox)),
  })).filter((g) => g.items.length);
}

