import { createSign } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { SheetKind } from "@/db/schema";
import { formatMoney } from "./plans";

/**
 * Google Sheets sync through one WhatsFlow service account. The customer shares
 * their sheet with the service account's email as an editor; we append rows.
 * No Google sign-in, and we can only see sheets that were shared with us.
 */

export const SHEET_KINDS: Record<SheetKind, { label: string; tab: string; headers: string[] }> = {
  leads: { label: "Leads", tab: "WhatsFlow leads", headers: ["Created", "Title", "Name", "Phone", "Stage", "Value", "Source", "Owner"] },
  appointments: { label: "Bookings", tab: "WhatsFlow bookings", headers: ["Booked at", "Service", "Starts", "Name", "Phone", "Status", "Source"] },
  orders: { label: "Orders", tab: "WhatsFlow orders", headers: ["Created", "Order", "Name", "Phone", "Items", "Total", "Payment", "Status", "Source"] },
  enquiries: { label: "Enquiries", tab: "WhatsFlow enquiries", headers: ["Received", "Name", "Phone", "First message", "Source", "Ad"] },
  contacts: { label: "New contacts", tab: "WhatsFlow contacts", headers: ["Added", "Name", "Phone", "Email", "Tags", "Source"] },
};

export function serviceAccount(): { email: string; key: string } | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");
  return email && key ? { email, key } : null;
}

/** The spreadsheet id from a pasted link, or the id itself. */
export function spreadsheetIdFrom(input: string): string | null {
  const m = input.trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) ?? input.trim().match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

let cached: { token: string; until: number } | null = null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** OAuth access token for the service account (JWT bearer grant), cached until near expiry. */
async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new SheetError("Google Sheets isn't set up on this server (GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY).");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: sa.email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new SheetError(`Google sign-in for the service account failed: ${body.error_description ?? res.status}`);
  cached = { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export class SheetError extends Error {}

async function sheetsApi(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (res.status === 403 || res.status === 404) {
    throw new SheetError(`We can't open that sheet. Share it with ${serviceAccount()?.email} as an Editor, then try again.`);
  }
  if (!res.ok) throw new SheetError(`Google Sheets said: ${body.error?.message ?? res.status}`);
  return body;
}

const range = (tab: string, cells: string) => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${cells}`);

/** Check we can edit the sheet, create the tab if it's missing, and write the header row. Returns the sheet's title. */
export async function prepareSheet(spreadsheetId: string, tab: string, kind: SheetKind): Promise<string> {
  const meta = (await sheetsApi(`${spreadsheetId}?fields=properties.title,sheets.properties.title`)) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  };
  const exists = meta.sheets?.some((s) => s.properties?.title === tab);
  if (!exists) await sheetsApi(`${spreadsheetId}:batchUpdate`, { method: "POST", body: { requests: [{ addSheet: { properties: { title: tab } } }] } });
  const head = (await sheetsApi(`${spreadsheetId}/values/${range(tab, "A1:A1")}`)) as { values?: string[][] };
  if (!head.values?.length) {
    await sheetsApi(`${spreadsheetId}/values/${range(tab, "A1")}?valueInputOption=RAW`, { method: "PUT", body: { values: [SHEET_KINDS[kind].headers] } });
  }
  return meta.properties?.title ?? "your sheet";
}

async function appendRows(spreadsheetId: string, tab: string, values: string[][]) {
  // RAW so a customer's message that starts with "=" lands as text, not a formula.
  await sheetsApi(`${spreadsheetId}/values/${range(tab, "A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values } });
}

type Rowed = { id: string; createdAt: Date; cells: string[] };

const iso = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "");

/** New rows of one kind after the cursor, oldest first. */
export async function rowsAfter(d: DB, orgId: string, kind: SheetKind, after: { at: Date; id: string | null }, limit = 200): Promise<Rowed[]> {
  // Compare and order at millisecond precision: the cursor round-trips through a JS Date,
  // which drops Postgres's microseconds and would otherwise resend or skip rows.
  const ms = (t: { createdAt: unknown }) => sql`date_trunc('milliseconds', ${t.createdAt})`;
  const past = (t: { createdAt: unknown; id: unknown }) =>
    after.id ? sql`(${ms(t)}, ${t.id}) > (${after.at.toISOString()}::timestamptz, ${after.id}::uuid)` : sql`${ms(t)} > ${after.at.toISOString()}::timestamptz`;
  const c = schema.contacts;
  switch (kind) {
    case "leads": {
      const t = schema.leads;
      const rows = await d
        .select({ l: t, name: c.name, waId: c.waId, stage: schema.pipelineStages.name, owner: schema.users.name })
        .from(t)
        .innerJoin(c, eq(c.id, t.contactId))
        .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, t.stageId))
        .leftJoin(schema.users, eq(schema.users.id, t.ownerId))
        .where(and(eq(t.orgId, orgId), past(t)))
        .orderBy(ms(t), asc(t.id))
        .limit(limit);
      return rows.map((r) => ({ id: r.l.id, createdAt: r.l.createdAt, cells: [iso(r.l.createdAt), r.l.title, r.name ?? "", `+${r.waId}`, r.stage, formatMoney(r.l.valueMinor, r.l.currency), r.l.source, r.owner ?? ""] }));
    }
    case "appointments": {
      const t = schema.appointments;
      const rows = await d
        .select({ a: t, name: c.name, waId: c.waId, service: schema.services.name })
        .from(t)
        .innerJoin(c, eq(c.id, t.contactId))
        .innerJoin(schema.services, eq(schema.services.id, t.serviceId))
        .where(and(eq(t.orgId, orgId), past(t)))
        .orderBy(ms(t), asc(t.id))
        .limit(limit);
      return rows.map((r) => ({ id: r.a.id, createdAt: r.a.createdAt, cells: [iso(r.a.createdAt), r.service, iso(r.a.startAt), r.name ?? "", `+${r.waId}`, r.a.status, r.a.source] }));
    }
    case "orders": {
      const t = schema.orders;
      const rows = await d
        .select({ o: t, name: c.name, waId: c.waId })
        .from(t)
        .innerJoin(c, eq(c.id, t.contactId))
        .where(and(eq(t.orgId, orgId), past(t)))
        .orderBy(ms(t), asc(t.id))
        .limit(limit);
      return rows.map((r) => ({
        id: r.o.id,
        createdAt: r.o.createdAt,
        cells: [iso(r.o.createdAt), `#${r.o.number}`, r.name ?? "", `+${r.waId}`, r.o.items.map((i) => `${i.qty} × ${i.name}`).join(", "), formatMoney(r.o.totalMinor, r.o.currency), r.o.paymentStatus, r.o.status, r.o.source],
      }));
    }
    case "enquiries": {
      const t = schema.enquiries;
      const rows = await d
        .select({ e: t, name: c.name, waId: c.waId })
        .from(t)
        .innerJoin(c, eq(c.id, t.contactId))
        .where(and(eq(t.orgId, orgId), past(t)))
        .orderBy(ms(t), asc(t.id))
        .limit(limit);
      return rows.map((r) => ({ id: r.e.id, createdAt: r.e.createdAt, cells: [iso(r.e.createdAt), r.name ?? "", `+${r.waId}`, r.e.topic, r.e.source, r.e.ad?.headline ?? ""] }));
    }
    case "contacts": {
      const rows = await d.select().from(c).where(and(eq(c.orgId, orgId), past(c))).orderBy(ms(c), asc(c.id)).limit(limit);
      return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, cells: [iso(r.createdAt), r.name ?? "", `+${r.waId}`, r.email ?? "", r.tags.join(", "), r.source] }));
    }
  }
}

/** Send one sync's new rows. Stops at the first error and keeps the cursor, so nothing is skipped. */
export async function runSheetSync(d: DB, sync: typeof schema.sheetSyncs.$inferSelect) {
  try {
    let sent = 0;
    let cursor = { at: sync.cursorAt, id: sync.cursorId };
    for (let batch = 0; batch < 5; batch++) {
      const rows = await rowsAfter(d, sync.orgId, sync.kind, cursor);
      if (!rows.length) break;
      await appendRows(sync.spreadsheetId, sync.tab, rows.map((r) => r.cells));
      const last = rows[rows.length - 1];
      cursor = { at: last.createdAt, id: last.id };
      sent += rows.length;
      await d
        .update(schema.sheetSyncs)
        .set({ cursorAt: cursor.at, cursorId: cursor.id, rowsSynced: sql`${schema.sheetSyncs.rowsSynced} + ${rows.length}`, lastSyncedAt: new Date(), lastError: null })
        .where(eq(schema.sheetSyncs.id, sync.id));
      if (rows.length < 200) break;
    }
    if (!sent && sync.lastError) await d.update(schema.sheetSyncs).set({ lastError: null }).where(eq(schema.sheetSyncs.id, sync.id));
    return sent;
  } catch (e) {
    const message = e instanceof SheetError ? e.message : `Couldn't reach Google Sheets: ${(e as Error).message}`;
    await d.update(schema.sheetSyncs).set({ lastError: message.slice(0, 300) }).where(eq(schema.sheetSyncs.id, sync.id));
    return 0;
  }
}

/** Every minute: push new rows for every active sync. */
export async function syncAllSheets(d: DB) {
  if (!serviceAccount()) return;
  const syncs = await d.select().from(schema.sheetSyncs).where(eq(schema.sheetSyncs.active, true));
  for (const s of syncs) await runSheetSync(d, s);
}

/** For tests: forget the cached Google token. */
export function resetSheetsToken() {
  cached = null;
}
