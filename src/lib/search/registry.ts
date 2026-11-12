import Fuse, { type FuseResultMatch } from "fuse.js";
import {
  BarChart3,
  Bot,
  CalendarDays,
  CalendarPlus,
  CircleHelp,
  Code2,
  CreditCard,
  Database,
  FileText,
  History,
  Inbox,
  KanbanSquare,
  LifeBuoy,
  LineChart,
  LogOut,
  Megaphone,
  MessageCircleQuestion,
  Moon,
  Package,
  Phone,
  Plug,
  Route,
  Settings2,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Ticket,
  Upload,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/db/schema";

/** Actions that run code instead of opening a page. The palette implements each one. */
export type ActionId = "toggle-theme" | "logout" | "create-flow" | "create-automation" | "open-help";

export type StaticEntry = {
  id: string;
  type: "action" | "page" | "setting";
  title: string;
  /** Breadcrumb or hint, e.g. "Settings / Inbox / Automatic replies". */
  subtitle?: string;
  /** Page to open. Settings also carry the card's DOM id and the field to focus. */
  path?: string;
  anchor?: string;
  /** Element id, or a form field `name`, inside the card (or the page when there is no anchor). */
  field?: string;
  action?: ActionId;
  keywords: string[];
  synonyms: string[];
  /** Who can see it. Absent means everyone. */
  roles?: Role[];
  /** Only when the workspace has a sandbox number. */
  sandbox?: boolean;
  icon: LucideIcon;
  /** Shown in "Quick actions" when the query is empty. */
  quick?: boolean;
};

const ADMIN: Role[] = ["owner", "admin"];

type Field = { field?: string; title: string; help?: string; keywords?: string[]; synonyms?: string[]; roles?: Role[] };
type Section = { anchor?: string; title: string; help?: string; keywords?: string[]; synonyms?: string[]; roles?: Role[]; fields?: Field[] };
type SettingsPageDef = {
  key: string;
  path: string;
  title: string;
  /** Crumb before the page title: "Settings", or the app page a settings screen belongs to. */
  crumb?: string;
  icon: LucideIcon;
  keywords?: string[];
  synonyms?: string[];
  roles?: Role[];
  sandbox?: boolean;
  sections?: Section[];
};

/** Same id rule as SettingsSection: `s-` + the title in kebab case. */
const sid = (title: string) => `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
const words = (s?: string) => (s ? [s] : []);

const SETTINGS: SettingsPageDef[] = [
  {
    key: "inbox",
    path: "/settings",
    title: "Inbox",
    icon: Inbox,
    keywords: ["inbox settings", "general"],
    synonyms: ["preferences", "workspace settings"],
    sections: [
      {
        title: "Business",
        help: "Your business name and the time zone used for opening hours and reports.",
        roles: ADMIN,
        fields: [
          { field: "orgName", title: "Business name", synonyms: ["company name", "workspace name", "brand", "rename workspace"] },
          { field: "timezone", title: "Time zone", help: "Used for opening hours and reports.", synonyms: ["time zone", "tz", "region", "clock", "timezone", "local time"] },
        ],
      },
      {
        title: "Automatic replies",
        help: "Sent when a new conversation starts and no bot flow picks it up.",
        roles: ADMIN,
        synonyms: ["auto reply", "autoresponder", "auto-responder"],
        fields: [
          { field: "welcomeEnabled", title: "Welcome message", help: "Sent during opening hours.", synonyms: ["greeting", "greeting message", "first message", "hello message", "intro message"] },
          { field: "awayEnabled", title: "Away message", help: "Sent outside opening hours.", synonyms: ["closed message", "after hours", "out of office", "ooo", "holiday message", "offline message"] },
        ],
      },
      {
        title: "Opening hours",
        help: "Days you are open. Closed days get the away message.",
        roles: ADMIN,
        synonyms: ["business hours", "working hours", "office hours", "timings", "schedule", "open hours", "closing time"],
        fields: [{ field: "mon_on", title: "Days you are open", synonyms: ["weekend", "monday", "saturday", "sunday", "closed days"] }],
      },
      {
        title: "Alerts and opt-out",
        help: "When to flag a waiting customer, and which words stop marketing messages.",
        roles: ADMIN,
        fields: [
          { field: "wait", title: "Wait alert", help: "Alert when a customer waits longer than (minutes).", synonyms: ["waiting time", "response time", "sla", "slow reply", "overdue"] },
          {
            field: "optout",
            title: "Opt-out keywords",
            help: "A customer who sends one of these stops getting marketing messages.",
            synonyms: ["unsubscribe", "stop", "opt out", "do not disturb", "dnd", "consent"],
          },
        ],
      },
      {
        title: "Notifications",
        help: "Push notifications for new messages and assignments, switched on per device.",
        synonyms: ["push", "push notifications", "alerts on phone", "notify me", "mobile notifications", "browser notifications", "sound"],
      },
      {
        title: "Quick replies",
        help: "Type / in the inbox to use them.",
        synonyms: ["canned responses", "saved replies", "snippets", "macros", "shortcuts", "templates for agents"],
        fields: [{ field: "shortcut", title: "Add a quick reply", synonyms: ["new quick reply", "canned response"] }],
      },
    ],
  },
  {
    key: "team",
    path: "/settings/team",
    title: "Team",
    icon: Users,
    roles: ADMIN,
    synonyms: ["members", "users", "staff", "agents", "people", "seats", "employees"],
    sections: [
      { title: "Members", help: "Everyone with access to this workspace.", synonyms: ["roles", "permissions", "remove member", "change role", "admin", "owner"] },
      { anchor: "invite", title: "Invite someone", help: "Agents work the inbox. Admins can also change settings.", synonyms: ["add user", "add member", "invite teammate", "add agent"], fields: [{ field: "email", title: "Invite by email", synonyms: ["invite email"] }] },
    ],
  },
  {
    key: "routing",
    path: "/settings/routing",
    title: "Chat routing",
    icon: Route,
    roles: ADMIN,
    synonyms: ["assignment", "auto assign", "round robin", "distribution", "routing rules", "least busy"],
    sections: [
      { title: "Rules", help: "Send each new chat to the right person. The first matching rule wins." },
      {
        title: "Add a rule",
        help: "Match on a word in the first message, or on the language it is written in.",
        fields: [
          { field: "assignTo", title: "Assign to", synonyms: ["assignee", "route to"] },
          { field: "label", title: "Routing label", help: "Shown on the chat in the inbox.", synonyms: ["chat label", "tag chat"] },
        ],
      },
    ],
  },
  {
    key: "whatsapp",
    path: "/settings/whatsapp",
    title: "WhatsApp numbers",
    icon: Smartphone,
    roles: ADMIN,
    synonyms: ["phone number", "waba", "cloud api", "meta", "business account", "channel", "whatsapp business"],
    sections: [
      { title: "Numbers", help: "Connect your number through Meta's official Cloud API.", synonyms: ["connection check", "quality rating", "disconnect"] },
      {
        anchor: "profile",
        title: "Business profile",
        help: "What customers see when they tap your name in WhatsApp.",
        synonyms: ["whatsapp profile", "profile picture", "display picture"],
        fields: [
          { field: "about", title: "About", help: "Up to 139 characters, shown under your name.", synonyms: ["bio", "status text", "tagline"] },
          { field: "description", title: "Business description", synonyms: ["description"] },
          { field: "address", title: "Business address", synonyms: ["location", "address"] },
          { field: "vertical", title: "Business category", synonyms: ["industry", "category", "vertical"] },
          { field: "pemail", title: "Business email", synonyms: ["contact email"] },
          { field: "website", title: "Website", synonyms: ["url", "site", "web address"] },
          { field: "photoUrl", title: "Profile photo", synonyms: ["logo", "avatar", "dp", "picture"] },
        ],
      },
      {
        anchor: "connect",
        title: "Connect a real number",
        help: "Use Meta's official Cloud API.",
        synonyms: ["add number", "connect number", "go live"],
        fields: [
          { field: "pnid", title: "Phone number ID", synonyms: ["phone id"] },
          { field: "waba", title: "WhatsApp Business Account ID", synonyms: ["waba id", "business account id"] },
          { field: "tok", title: "Access token", synonyms: ["meta token", "system user token", "api token"] },
        ],
      },
    ],
  },
  {
    key: "sandbox",
    path: "/settings/sandbox",
    title: "Sandbox phone",
    icon: Phone,
    sandbox: true,
    keywords: ["test phone", "simulator"],
    synonyms: ["test", "try it", "demo phone", "preview", "emulator", "test number"],
  },
  {
    key: "ai",
    path: "/settings/ai",
    title: "AI replies",
    icon: Sparkles,
    roles: ADMIN,
    synonyms: ["ai", "chatbot", "gpt", "assistant", "artificial intelligence", "auto answer", "claude"],
    sections: [
      {
        title: "AI replies",
        help: "Answer common questions around the clock, using only what you write here.",
        fields: [
          { field: "enabled", title: "Reply with AI", help: "When no bot flow handles a message.", synonyms: ["turn on ai", "enable ai"] },
          { field: "businessInfo", title: "About your business", synonyms: ["knowledge base", "business info", "context"] },
          { field: "faqs", title: "Questions and answers", synonyms: ["faq", "faqs", "common questions", "knowledge"] },
        ],
      },
      { title: "Catalog", help: "Let the AI quote from your product list.", fields: [{ field: "includeCatalog", title: "Use the catalog in AI replies", synonyms: ["products in ai", "prices"] }] },
      {
        title: "Handover",
        help: "When the AI should stop and pass the chat to your team.",
        synonyms: ["human handoff", "escalation", "transfer to agent"],
        fields: [
          { field: "hk", title: "Handover keywords", help: "Hand over when the customer says these words.", synonyms: ["talk to human", "agent keywords"] },
          { field: "mr", title: "Max AI replies", help: "Hand over after this many AI replies.", synonyms: ["reply limit", "ai limit"] },
        ],
      },
    ],
  },
  {
    key: "payments",
    path: "/settings/payments",
    title: "Payments",
    icon: Wallet,
    roles: ADMIN,
    synonyms: ["payment links", "collect money", "checkout", "upi", "gateway"],
    sections: [
      { anchor: "razorpay", title: "Razorpay", help: "Payment links in chat, paid straight to your account.", synonyms: ["upi", "india payments"] },
      { anchor: "stripe", title: "Stripe", help: "Payment links in chat, paid straight to your account.", synonyms: ["card payments"] },
      {
        title: "Payment reminders",
        help: "One reminder with the same link, sent in chat.",
        fields: [{ field: "reminderHours", title: "Remind unpaid customers after", synonyms: ["unpaid reminder", "payment follow up", "dunning"] }],
      },
    ],
  },
  {
    key: "integrations",
    path: "/settings/integrations",
    title: "Connected apps",
    icon: Plug,
    roles: ADMIN,
    synonyms: ["integrations", "apps", "connect store", "ecommerce", "zapier"],
    sections: [
      { title: "Overview", help: "Orders from your store land in Orders." },
      {
        anchor: "shopify",
        title: "Shopify",
        help: "New and updated orders, and abandoned checkouts.",
        synonyms: ["shopify store"],
        fields: [
          { field: "shopUrl", title: "Shopify store address", synonyms: ["myshopify"] },
          { field: "cartMinutes", title: "Abandoned checkout after", help: "Count a checkout as abandoned after (minutes).", synonyms: ["abandoned cart", "cart recovery", "cart reminder"] },
        ],
      },
      { anchor: "woocommerce", title: "WooCommerce", help: "New and updated orders.", synonyms: ["woo", "wordpress"], fields: [{ field: "wooUrl", title: "WooCommerce shop address" }] },
      {
        anchor: "sheets",
        title: "Google Sheets",
        help: "New leads, bookings, orders, enquiries or contacts are added as rows to your sheet.",
        synonyms: ["spreadsheet", "excel", "google sheet", "export rows", "sync"],
        fields: [{ field: "sheet", title: "Sheet link", synonyms: ["spreadsheet url"] }],
      },
    ],
  },
  {
    key: "developers",
    path: "/settings/developers",
    title: "API & webhooks",
    icon: Code2,
    roles: ADMIN,
    synonyms: ["developers", "api", "rest api", "integration", "dev"],
    sections: [
      { anchor: "api-keys", title: "API keys", help: "Read and send from your own systems.", synonyms: ["token", "secret key", "api token", "credentials"], fields: [{ field: "kname", title: "New API key", synonyms: ["create api key", "generate key"] }] },
      { anchor: "webhooks", title: "Webhooks", help: "Get events pushed to your own URL.", synonyms: ["callback url", "events", "notifications"], fields: [{ field: "wurl", title: "Webhook endpoint URL", synonyms: ["add webhook"] }] },
      { title: "API requests", help: "Requests made with your keys.", synonyms: ["api log", "request log", "rate limit"] },
      { title: "Recent deliveries", help: "Webhook deliveries and retries.", synonyms: ["delivery log", "failed webhooks", "retry"] },
    ],
  },
  {
    key: "billing",
    path: "/settings/billing",
    title: "Plan & billing",
    icon: CreditCard,
    roles: ADMIN,
    synonyms: ["billing", "subscription", "pricing", "invoice", "payment method", "upgrade", "trial"],
    sections: [
      { title: "Usage", help: "Team members, live bot flows and connected numbers against your plan.", synonyms: ["limits", "quota"] },
      { title: "Plan", help: "Pick a plan or change how often you are billed.", synonyms: ["upgrade", "downgrade", "change plan", "annual", "monthly"], fields: [{ field: "interval", title: "Billing period", synonyms: ["yearly", "monthly billing"] }] },
      { title: "Cancel", help: "One click, no call or email needed.", synonyms: ["cancel subscription", "stop billing", "end plan"] },
      { title: "History", help: "Plan changes on this workspace.", synonyms: ["billing history", "invoices"] },
    ],
  },
  {
    key: "data",
    path: "/settings/data",
    title: "Your data",
    icon: Database,
    roles: ADMIN,
    synonyms: ["privacy", "gdpr", "data"],
    sections: [
      { title: "Export", help: "Download a copy of your records any time.", synonyms: ["download", "backup", "csv", "export data"] },
      { title: "Delete this workspace", help: "Permanent. Download your data first.", synonyms: ["delete account", "close account", "remove workspace"], fields: [{ field: "confirm", title: "Confirm workspace deletion" }] },
    ],
  },
  {
    key: "audit",
    path: "/settings/audit",
    title: "Audit log",
    icon: History,
    roles: ADMIN,
    synonyms: ["activity log", "history", "changes", "security log", "who changed"],
  },
  {
    key: "booking",
    path: "/appointments/settings",
    title: "Services & hours",
    crumb: "Appointments",
    icon: Settings2,
    roles: ADMIN,
    synonyms: ["booking settings", "appointment settings", "services", "slots", "availability"],
    sections: [
      {
        title: "Services",
        fields: [
          { field: "sname", title: "New service", synonyms: ["add service", "treatment", "offering"] },
          { field: "dur", title: "Service length", synonyms: ["duration", "minutes"] },
          { field: "cap", title: "Bookings at the same time", help: "Chairs, rooms or staff free at once.", synonyms: ["capacity", "parallel bookings"] },
        ],
      },
      {
        title: "Bookable hours",
        fields: [
          { field: "slot", title: "Slot length", help: "Start a slot every (minutes).", synonyms: ["slot interval", "booking interval"] },
          { field: "lead", title: "Earliest booking from now", synonyms: ["notice period", "lead time"] },
          { field: "ahead", title: "Bookable days ahead", synonyms: ["booking window", "advance booking"] },
          { field: "remind", title: "Appointment reminder", help: "Remind customers (hours before).", synonyms: ["reminder", "booking reminder", "no show"] },
        ],
      },
    ],
  },
];

const PAGES: (Omit<StaticEntry, "type" | "id" | "keywords" | "synonyms"> & { key: string; keywords?: string[]; synonyms?: string[] })[] = [
  { key: "dashboard", title: "Dashboard", path: "/dashboard", icon: BarChart3, synonyms: ["home", "overview", "start"] },
  { key: "analytics", title: "Analytics", path: "/analytics", icon: LineChart, roles: ADMIN, synonyms: ["reports", "stats", "insights", "metrics", "charts"] },
  { key: "inbox", title: "Inbox", path: "/inbox", icon: Inbox, synonyms: ["chats", "conversations", "messages", "whatsapp"] },
  { key: "enquiries", title: "Enquiries", path: "/enquiries", icon: MessageCircleQuestion, synonyms: ["questions", "inquiries", "ads", "click to whatsapp"] },
  { key: "tickets", title: "Tickets", path: "/tickets", icon: Ticket, synonyms: ["support", "issues", "complaints", "helpdesk"] },
  { key: "contacts", title: "Contacts", path: "/contacts", icon: Users, synonyms: ["customers", "people", "crm", "address book", "clients"] },
  { key: "segments", title: "Segments", subtitle: "Contacts", path: "/contacts/segments", icon: Users, synonyms: ["audiences", "lists", "groups", "filters"] },
  { key: "import", title: "Import contacts", subtitle: "Contacts", path: "/contacts/import", icon: Upload, synonyms: ["upload csv", "bulk add", "import csv", "excel"] },
  { key: "pipeline", title: "Pipeline", path: "/pipeline", icon: KanbanSquare, synonyms: ["leads", "deals", "sales", "kanban", "funnel"] },
  { key: "orders", title: "Orders", path: "/orders", icon: ShoppingBag, synonyms: ["sales", "purchases", "invoices"] },
  { key: "catalog", title: "Catalog", path: "/catalog", icon: Package, synonyms: ["products", "inventory", "items", "stock", "shop"] },
  { key: "appointments", title: "Appointments", path: "/appointments", icon: CalendarDays, synonyms: ["bookings", "calendar", "schedule", "reservations"] },
  { key: "campaigns", title: "Campaigns", path: "/campaigns", icon: Megaphone, synonyms: ["broadcasts", "bulk messages", "marketing", "blast"] },
  { key: "templates", title: "Templates", path: "/templates", icon: FileText, synonyms: ["message templates", "hsm", "approved messages"] },
  { key: "bots", title: "Bot flows", path: "/bots", icon: Bot, synonyms: ["chatbot", "flows", "auto reply", "keywords", "menus"] },
  { key: "automations", title: "Automations", path: "/automations", icon: Workflow, synonyms: ["workflows", "triggers", "sequences", "drip"] },
  { key: "support", title: "Talk to a person", path: "/support", icon: LifeBuoy, synonyms: ["help", "support", "contact us", "chat with us"] },
];

const ACTIONS: (Omit<StaticEntry, "type" | "keywords"> & { keywords?: string[] })[] = [
  { id: "action.create-contact", title: "Create contact", path: "/contacts?new=1", icon: UserPlus, quick: true, synonyms: ["add contact", "new contact", "new customer", "add customer"] },
  { id: "action.create-lead", title: "Create lead", subtitle: "From a conversation in the inbox", path: "/inbox", icon: KanbanSquare, synonyms: ["new lead", "add deal", "new deal"] },
  { id: "action.create-order", title: "Create order", path: "/orders/new", icon: ShoppingBag, quick: true, synonyms: ["new order", "add order", "take order", "sell"] },
  { id: "action.create-ticket", title: "Create ticket", subtitle: "From a conversation in the inbox", path: "/inbox", icon: Ticket, synonyms: ["new ticket", "raise ticket", "log issue"] },
  { id: "action.create-booking", title: "Create booking", path: "/appointments", anchor: "booking", field: "contactId", icon: CalendarPlus, quick: true, synonyms: ["new appointment", "book appointment", "new booking", "schedule"] },
  { id: "action.create-product", title: "Create product", path: "/catalog?new=1", icon: Package, roles: ADMIN, synonyms: ["add product", "new product", "add item"] },
  { id: "action.create-template", title: "Create template", path: "/templates/new", icon: FileText, roles: ADMIN, synonyms: ["new template", "add template"] },
  { id: "action.create-campaign", title: "Create campaign", path: "/campaigns/new", icon: Megaphone, roles: ADMIN, quick: true, synonyms: ["new campaign", "new broadcast", "send broadcast", "bulk message"] },
  { id: "action.create-flow", title: "Create bot flow", action: "create-flow", icon: Bot, roles: ADMIN, synonyms: ["new flow", "new bot", "build chatbot"] },
  { id: "action.create-automation", title: "Create automation", action: "create-automation", icon: Workflow, roles: ADMIN, synonyms: ["new automation", "new workflow"] },
  { id: "action.invite", title: "Invite member", path: "/settings/team", anchor: "invite", field: "email", icon: UserPlus, roles: ADMIN, quick: true, synonyms: ["invite teammate", "add user", "add agent", "add member"] },
  { id: "action.connect-number", title: "Connect WhatsApp number", path: "/settings/whatsapp", anchor: "connect", field: "pnid", icon: Smartphone, roles: ADMIN, synonyms: ["add number", "go live", "link whatsapp"] },
  { id: "action.toggle-theme", title: "Toggle dark mode", action: "toggle-theme", icon: Moon, quick: true, synonyms: ["dark theme", "light mode", "night mode", "theme", "appearance"] },
  { id: "action.sandbox", title: "Open sandbox phone", path: "/settings/sandbox", icon: Phone, sandbox: true, synonyms: ["test bot", "try flow", "simulator", "test phone"] },
  { id: "action.help", title: "Help for this page", subtitle: "How to use the page you're on", action: "open-help", icon: CircleHelp, quick: true, synonyms: ["help", "how do i", "guide", "tutorial", "instructions", "tour"] },
  { id: "action.logout", title: "Log out", action: "logout", icon: LogOut, synonyms: ["sign out", "logout", "exit"] },
];

function build(): StaticEntry[] {
  const out: StaticEntry[] = ACTIONS.map((a) => ({ ...a, type: "action", keywords: a.keywords ?? [] }));
  for (const p of PAGES) {
    const { key, keywords, synonyms, ...rest } = p;
    out.push({ ...rest, id: `page.${key}`, type: "page", keywords: keywords ?? [], synonyms: synonyms ?? [] });
  }
  for (const p of SETTINGS) {
    const crumb = p.crumb ?? "Settings";
    out.push({
      id: `settings.${p.key}`,
      type: "page",
      title: p.title,
      subtitle: crumb,
      path: p.path,
      icon: p.icon,
      roles: p.roles,
      sandbox: p.sandbox,
      keywords: ["settings", ...(p.keywords ?? [])],
      synonyms: p.synonyms ?? [],
    });
    for (const s of p.sections ?? []) {
      const roles = s.roles ?? p.roles;
      const anchor = p.crumb ? undefined : (s.anchor ?? sid(s.title));
      // A section whose title repeats the page's ("AI replies") adds nothing as its own result.
      if (s.title !== p.title) {
        out.push({
          id: `setting.${p.key}.${anchor ?? sid(s.title)}`,
          type: "setting",
          title: s.title,
          subtitle: `${crumb} / ${p.title}`,
          path: p.path,
          anchor,
          icon: p.icon,
          roles,
          sandbox: p.sandbox,
          keywords: [...words(s.help), ...(s.keywords ?? [])],
          synonyms: s.synonyms ?? [],
        });
      }
      for (const f of s.fields ?? []) {
        out.push({
          id: `setting.${p.key}.${f.field}`,
          type: "setting",
          title: f.title,
          subtitle: `${crumb} / ${p.title} / ${s.title}`,
          path: p.path,
          anchor,
          field: f.field,
          icon: p.icon,
          roles: f.roles ?? roles,
          sandbox: p.sandbox,
          keywords: [...words(f.help), ...(f.keywords ?? [])],
          synonyms: [...(f.synonyms ?? []), ...(s.synonyms ?? [])],
        });
      }
    }
  }
  return out;
}

export const REGISTRY: StaticEntry[] = build();

/** Entries this person can open. */
export function staticEntries(role: Role, hasSandbox: boolean): StaticEntry[] {
  return REGISTRY.filter((e) => (!e.roles || e.roles.includes(role)) && (!e.sandbox || hasSandbox));
}

export type StaticHit = { entry: StaticEntry; matches: readonly FuseResultMatch[] };

const fuses = new WeakMap<StaticEntry[], Fuse<StaticEntry>>();

/** Fuzzy match on title (weighted highest), synonyms and keywords. */
export function rankStatic(entries: StaticEntry[], q: string, limit = 20): StaticHit[] {
  let fuse = fuses.get(entries);
  if (!fuse) {
    fuse = new Fuse(entries, {
      keys: [
        { name: "title", weight: 3 },
        { name: "synonyms", weight: 2 },
        { name: "keywords", weight: 1 },
        { name: "subtitle", weight: 0.5 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeMatches: true,
      includeScore: true,
      minMatchCharLength: 2,
    });
    fuses.set(entries, fuse);
  }
  return fuse.search(q, { limit }).map((r) => ({ entry: r.item, matches: r.matches ?? [] }));
}
