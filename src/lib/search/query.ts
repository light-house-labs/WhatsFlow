/** Query parsing shared by the command palette and /api/search. No server or browser APIs. */

export const ENTITY_TYPES = [
  "contacts",
  "conversations",
  "leads",
  "orders",
  "tickets",
  "appointments",
  "products",
  "templates",
  "bot_flows",
  "campaigns",
  "automations",
  "messages",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Results order in the palette: contacts and conversations first, messages last. */
export const ENTITY_LABEL: Record<EntityType, string> = {
  contacts: "Contacts",
  conversations: "Conversations",
  leads: "Leads",
  orders: "Orders",
  tickets: "Tickets",
  appointments: "Appointments",
  products: "Products",
  templates: "Templates",
  bot_flows: "Bot flows",
  campaigns: "Campaigns",
  automations: "Automations",
  messages: "Messages",
};

/** Pages behind these need an admin, so agents don't get them as results. */
export const ADMIN_TYPES: EntityType[] = ["bot_flows", "automations"];

export type SearchHit = { id: string; title: string; subtitle: string; href: string; tag?: string };
export type SearchGroup = { type: EntityType; items: SearchHit[] };
export type SearchResponse = { groups: SearchGroup[]; ms: number };

export type Mode = "all" | "actions" | "contacts" | "numbers";

/** ">" actions only, "@" contacts, "#" orders and tickets by number. */
export function parsePrefix(raw: string): { mode: Mode; text: string } {
  const t = raw.trimStart();
  if (t.startsWith(">")) return { mode: "actions", text: t.slice(1).trim() };
  if (t.startsWith("@")) return { mode: "contacts", text: t.slice(1).trim() };
  if (t.startsWith("#")) return { mode: "numbers", text: t.slice(1).trim() };
  return { mode: "all", text: t.trim() };
}

/**
 * A query that looks like a phone number, reduced to the digits to look for inside a stored wa_id
 * (country code + national number, digits only). Strips spaces, +, 00 and a trunk 0; longer than ten
 * digits keeps the last ten, which drops the country code whatever it is.
 */
export function phoneDigits(q: string): string | null {
  if (!/^[\d\s+().\-]+$/.test(q)) return null;
  const d = q.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 3) return null;
  return d.length > 10 ? d.slice(-10) : d;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "today", "tomorrow", "2026-11-12", "12/11", "12 nov", "nov 12" → YYYY-MM-DD, else null. Day comes before month in d/m. */
export function parseDay(q: string, now = new Date()): string | null {
  const t = q.trim().toLowerCase();
  const iso = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m, d));
    if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };
  const y = now.getFullYear();
  if (t === "today" || t === "tomorrow") {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (t === "tomorrow" ? 1 : 0));
    return iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (m) return iso(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y, +m[2] - 1, +m[1]);
  m = t.match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?$/);
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return iso(m[3] ? +m[3] : y, MONTHS.indexOf(m[2].slice(0, 3)), +m[1]);
  m = t.match(/^([a-z]{3,})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return iso(m[3] ? +m[3] : y, MONTHS.indexOf(m[1].slice(0, 3)), +m[2]);
  return null;
}

/** Lower case, accents dropped: what the database's wf_norm() does, for highlighting on the client. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
