import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { SegmentRules } from "@/db/schema";
import { drainJobs, makeOrg } from "./helpers";
import { audienceWhere, countSegment, describeRules, RulesSchema } from "@/lib/segments";
import { handleInbound } from "@/lib/wa/inbound";
import { enqueue } from "@/lib/jobs";
import { newApiKey } from "@/lib/api-auth";
import { prepareSheet, resetSheetsToken, runSheetSync, spreadsheetIdFrom } from "@/lib/sheets";
import { healthChecks } from "@/lib/health";
import { GET as listContacts } from "@/app/api/v1/contacts/route";
import { GET as health } from "@/app/api/health/route";

type Org = Awaited<ReturnType<typeof makeOrg>>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetSheetsToken();
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

async function people(o: Org) {
  const add = (waId: string, v: Partial<typeof schema.contacts.$inferInsert>) =>
    o.d.insert(schema.contacts).values({ orgId: o.org.id, waId, ...v }).returning().then((r) => r[0]);
  const regular = await add("919000000101", { name: "Regular", tags: ["vip"], lastInboundAt: daysAgo(90), customFields: { city: "Kochi" } });
  const fresh = await add("919000000102", { name: "Fresh", tags: ["vip", "new"], lastInboundAt: daysAgo(2), customFields: { city: "Pune" } });
  const quiet = await add("919000000103", { name: "Quiet", tags: [], customFields: { city: "100% Kochi" }, optedOutAt: new Date() });
  await o.d.insert(schema.orders).values({ orgId: o.org.id, number: 1, contactId: regular.id, items: [], totalMinor: 5000, paymentStatus: "paid", paidAt: daysAgo(80) });
  await o.d.insert(schema.orders).values({ orgId: o.org.id, number: 2, contactId: fresh.id, items: [], totalMinor: 900, paymentStatus: "unpaid" });
  return { regular, fresh, quiet };
}

async function names(o: Org, rules: SegmentRules) {
  const where = await audienceWhere(o.d, o.org.id, { segmentId: (await o.d.insert(schema.segments).values({ orgId: o.org.id, name: "t", rules }).returning())[0].id });
  return (await o.d.select({ name: schema.contacts.name }).from(schema.contacts).where(where).orderBy(asc(schema.contacts.name))).map((r) => r.name);
}

describe("segments", () => {
  it("filters contacts by tags, activity, orders and custom fields", async () => {
    const o = await makeOrg();
    await people(o);
    // win-back: bought before, quiet for 60+ days
    expect(await names(o, { match: "all", conditions: [{ field: "paid_order", op: "any" }, { field: "last_message", op: "older_than_days", days: 60 }] })).toEqual(["Regular"]);
    expect(await names(o, { match: "all", conditions: [{ field: "tag", op: "has", value: "vip" }, { field: "tag", op: "lacks", value: "new" }] })).toEqual(["Regular"]);
    expect(await names(o, { match: "any", conditions: [{ field: "tag", op: "has", value: "new" }, { field: "opted_out", op: "yes" }] })).toEqual(["Fresh", "Quiet"]);
    expect(await names(o, { match: "all", conditions: [{ field: "paid_order", op: "none" }] })).toEqual(["Fresh", "Quiet"]);
    expect(await names(o, { match: "all", conditions: [{ field: "paid_order", op: "within_days", days: 30 }] })).toEqual([]);
    // "%" is matched literally, not as a wildcard
    expect(await names(o, { match: "all", conditions: [{ field: "custom", op: "contains", key: "city", value: "100%" }] })).toEqual(["Quiet"]);
    expect(await names(o, { match: "all", conditions: [{ field: "custom", op: "equals", key: "city", value: "kochi" }] })).toEqual(["Regular"]);
    expect(await names(o, { match: "all", conditions: [{ field: "last_message", op: "never" }] })).toEqual(["Quiet"]);
  });

  it("stays inside its workspace, and a deleted segment matches nobody", async () => {
    const o = await makeOrg();
    const other = await makeOrg("Other");
    await people(o);
    await people(other);
    const rules: SegmentRules = { match: "all", conditions: [{ field: "tag", op: "has", value: "vip" }] };
    expect(await countSegment(o.d, o.org.id, rules)).toBe(2);
    const gone = await audienceWhere(o.d, o.org.id, { segmentId: "00000000-0000-4000-8000-000000000000" });
    const [{ n }] = await o.d.select({ n: sql<number>`count(*)` }).from(schema.contacts).where(gone);
    expect(Number(n)).toBe(0);
    expect(describeRules(rules)).toBe("tagged vip");
    expect(RulesSchema.safeParse({ match: "all", conditions: [] }).success).toBe(false);
  });

  it("sends a campaign to whoever matches the segment when it sends", async () => {
    const o = await makeOrg();
    const { regular, fresh } = await people(o);
    const [seg] = await o.d.insert(schema.segments).values({ orgId: o.org.id, name: "VIPs", rules: { match: "all", conditions: [{ field: "tag", op: "has", value: "vip" }] } }).returning();
    const [tpl] = await o.d.insert(schema.templates).values({ orgId: o.org.id, name: "hello_vip", language: "en", category: "UTILITY", body: "Hello!", status: "approved" }).returning();
    const [c] = await o.d.insert(schema.campaigns).values({ orgId: o.org.id, name: "VIP note", templateId: tpl.id, numberId: o.number.id, audience: { segmentId: seg.id }, status: "scheduled" }).returning();
    // someone tagged after the campaign was created still gets it
    await o.d.update(schema.contacts).set({ tags: ["vip"] }).where(eq(schema.contacts.waId, "919000000103"));
    await enqueue(o.d, "campaign.send", { campaignId: c.id });
    await drainJobs();
    const rec = await o.d.select().from(schema.campaignRecipients).where(eq(schema.campaignRecipients.campaignId, c.id));
    expect(rec.map((r) => r.contactId).sort()).toHaveLength(3);
    expect(rec.map((r) => r.contactId)).toEqual(expect.arrayContaining([regular.id, fresh.id]));
  });
});

describe("Click to WhatsApp ads", () => {
  it("records the ad on the enquiry and starts ad automations", async () => {
    const o = await makeOrg();
    await o.d.insert(schema.automations).values({ orgId: o.org.id, name: "Ad welcome", trigger: "ad_clicked", status: "live", steps: [{ type: "send_text", text: "Hi {name}, thanks for tapping “{ad_headline}”." }] });
    const r = await handleInbound(o.d, o.number, {
      waMessageId: "ad.1",
      from: "919000000201",
      profileName: "Meera",
      type: "text",
      text: "Is this still on?",
      timestamp: new Date(),
      referral: { source_url: "https://fb.me/abc", source_id: "120200", source_type: "ad", headline: "Diwali sale", body: "20% off", ctwa_clid: "clid-1" },
    });
    const conversationId = (r as { conversationId: string }).conversationId;
    const [enquiry] = await o.d.select().from(schema.enquiries).where(eq(schema.enquiries.conversationId, conversationId));
    expect(enquiry.source).toBe("ad");
    expect(enquiry.ad).toEqual({ sourceId: "120200", sourceType: "ad", sourceUrl: "https://fb.me/abc", headline: "Diwali sale", body: "20% off", ctwaClid: "clid-1" });
    const [contact] = await o.d.select().from(schema.contacts).where(and(eq(schema.contacts.orgId, o.org.id), eq(schema.contacts.waId, "919000000201")));
    expect(contact.source).toBe("ad");
    await drainJobs();
    const sent = await o.d.select().from(schema.messages).where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.direction, "out")));
    expect(sent.map((m) => m.body)).toContain("Hi Meera, thanks for tapping “Diwali sale”.");
  });
});

describe("API request log", () => {
  it("records each call with its key, status and error code", async () => {
    const o = await makeOrg();
    const k = newApiKey();
    const [key] = await o.d.insert(schema.apiKeys).values({ orgId: o.org.id, name: "crm", prefix: k.prefix, keyHash: k.hash, scope: "read" }).returning();
    const call = (auth: string) => listContacts(new Request("http://x/api/v1/contacts?limit=5", { headers: { authorization: `Bearer ${auth}` } }));
    expect((await call(k.key)).status).toBe(200);
    expect((await call("wf_live_nope")).status).toBe(401);
    const start = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await o.d.insert(schema.rateLimits).values({ bucket: `api:${key.id}`, windowStart: start, count: 10_000 }).onConflictDoUpdate({ target: [schema.rateLimits.bucket, schema.rateLimits.windowStart], set: { count: 10_000 } });
    expect((await call(k.key)).status).toBe(429);
    const log = await o.d.select().from(schema.apiRequests).where(eq(schema.apiRequests.orgId, o.org.id)).orderBy(asc(schema.apiRequests.createdAt));
    expect(log.map((l) => [l.method, l.path, l.status, l.error, l.keyId])).toEqual([
      ["GET", "/api/v1/contacts", 200, null, key.id],
      ["GET", "/api/v1/contacts", 429, "rate_limited", key.id],
    ]);
  });
});

describe("Google Sheets sync", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  function fakeGoogle(opts: { forbidden?: boolean } = {}) {
    const appended: string[][][] = [];
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${decodeURIComponent(url)}`);
      if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
      if (opts.forbidden) return Response.json({ error: { message: "denied" } }, { status: 403 });
      if (url.includes(":append")) {
        appended.push(JSON.parse(String(init!.body)).values);
        return Response.json({});
      }
      if (url.includes("?fields=")) return Response.json({ properties: { title: "Sales" }, sheets: [{ properties: { title: "Sheet1" } }] });
      if (url.includes("A1:A1")) return Response.json({});
      return Response.json({});
    });
    return { appended, calls };
  }

  it("reads the id from a pasted link", () => {
    expect(spreadsheetIdFrom("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz_-012345/edit#gid=0")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz_-012345");
    expect(spreadsheetIdFrom("not a link")).toBeNull();
  });

  it("adds the tab and header, then appends each new row exactly once", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "sync@whatsflow-test.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", pem.replace(/\n/g, "\\n"));
    const g = fakeGoogle();
    expect(await prepareSheet("SHEET123456789012345678", "WhatsFlow contacts", "contacts")).toBe("Sales");
    expect(g.calls.some((c) => c.includes(":batchUpdate"))).toBe(true);
    expect(g.calls.some((c) => c.startsWith("PUT") && c.includes("'WhatsFlow contacts'!A1"))).toBe(true);

    const o = await makeOrg();
    const [sync] = await o.d.insert(schema.sheetSyncs).values({ orgId: o.org.id, kind: "contacts", spreadsheetId: "SHEET123456789012345678", tab: "WhatsFlow contacts", cursorAt: new Date(0) }).returning();
    await o.d.insert(schema.contacts).values([
      { orgId: o.org.id, waId: "919000000301", name: "=HYPERLINK(\"x\")", tags: ["a"] },
      { orgId: o.org.id, waId: "919000000302", name: "Second" },
    ]);
    const reload = async () => (await o.d.select().from(schema.sheetSyncs).where(eq(schema.sheetSyncs.id, sync.id)))[0];
    expect(await runSheetSync(o.d, await reload())).toBe(2);
    expect(g.appended[0].map((r) => r[2]).sort()).toEqual(["+919000000301", "+919000000302"]);
    expect(await runSheetSync(o.d, await reload())).toBe(0);
    await o.d.insert(schema.contacts).values({ orgId: o.org.id, waId: "919000000303", name: "Third" });
    expect(await runSheetSync(o.d, await reload())).toBe(1);
    expect(g.appended).toHaveLength(2);
    expect((await reload()).rowsSynced).toBe(3);
    // values go in RAW, so a name that looks like a formula stays text
    expect(g.calls.filter((c) => c.includes(":append")).every((c) => c.includes("valueInputOption=RAW"))).toBe(true);
  });

  it("explains how to share the sheet when Google refuses", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "sync@whatsflow-test.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", pem);
    fakeGoogle({ forbidden: true });
    const o = await makeOrg();
    await o.d.insert(schema.contacts).values({ orgId: o.org.id, waId: "919000000304" });
    const [sync] = await o.d.insert(schema.sheetSyncs).values({ orgId: o.org.id, kind: "contacts", spreadsheetId: "SHEET123456789012345678", tab: "t", cursorAt: new Date(0) }).returning();
    expect(await runSheetSync(o.d, sync)).toBe(0);
    const [after] = await o.d.select().from(schema.sheetSyncs).where(eq(schema.sheetSyncs.id, sync.id));
    expect(after.lastError).toMatch(/Share it with sync@whatsflow-test/);
    expect(after.rowsSynced).toBe(0);
  });
});

describe("status", () => {
  it("reports the app as up", async () => {
    const o = await makeOrg();
    const h = await healthChecks(o.d);
    expect(h.checks.find((c) => c.id === "app")?.state).toBe("ok");
    expect(h.checks.map((c) => c.id)).toEqual(["app", "jobs", "sending"]);
    expect((await health()).status).toBe(200);
  });
});
