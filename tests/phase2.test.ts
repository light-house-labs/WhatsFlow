import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { FlowEdge, FlowNode } from "@/db/schema";
import { customerSays, drainJobs, makeOrg } from "./helpers";
import { candidateSlots, zonedToUtc } from "@/lib/booking";
import { verifyRazorpay, verifyStripe } from "@/lib/payments";
import { createOrder, markPaid } from "@/lib/orders";
import { emit } from "@/lib/events";
import { encrypt } from "@/lib/crypto";
import { signWebhook } from "@/lib/webhooks-out";
import { setAiClientForTests, toTranscript } from "@/lib/ai";
import { assertPublicUrl } from "@/lib/net-guard";
import { newApiKey } from "@/lib/api-auth";
import { POST as sendViaApi } from "@/app/api/v1/messages/route";
import { GET as listContacts } from "@/app/api/v1/contacts/route";

type Org = Awaited<ReturnType<typeof makeOrg>>;

const ALL_DAY = { open: "00:00", close: "23:59" };
const EVERY_DAY = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };

async function messages(o: Org, conversationId: string) {
  return o.d.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt));
}

async function liveFlow(o: Org, keyword: string, middle: FlowNode) {
  const nodes: FlowNode[] = [
    { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} },
    middle,
    { id: "end", type: "message", position: { x: 0, y: 0 }, data: { text: "Anything else?" } },
  ];
  const edges: FlowEdge[] = [
    { id: "e1", source: "t", target: middle.id },
    { id: "e2", source: middle.id, target: "end" },
  ];
  await o.d.insert(schema.botFlows).values({ orgId: o.org.id, name: keyword, trigger: { kind: "keyword", keywords: [keyword] }, graph: { nodes, edges }, status: "live" });
}

async function bookableService(o: Org) {
  await o.d.insert(schema.bookingSettings).values({ orgId: o.org.id, hours: EVERY_DAY, leadMinutes: 0, slotMinutes: 30 });
  const [svc] = await o.d.insert(schema.services).values({ orgId: o.org.id, name: "Check-up", durationMinutes: 30 }).returning();
  return svc;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setAiClientForTests(null);
});

describe("booking slots", () => {
  it("converts wall-clock time in a zone to UTC, across DST", () => {
    expect(zonedToUtc(2026, 11, 10, "10:30", "Asia/Kolkata").toISOString()).toBe("2026-11-10T05:00:00.000Z");
    expect(zonedToUtc(2026, 7, 1, "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("offers slots only inside opening hours, after the lead time, that fit the service", () => {
    const now = new Date("2026-11-09T04:00:00Z"); // Mon 09:30 IST
    const slots = candidateSlots({
      hours: { mon: { open: "09:00", close: "11:00" }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
      timeZone: "Asia/Kolkata",
      slotMinutes: 30,
      durationMinutes: 45,
      leadMinutes: 30,
      daysAhead: 7,
      now,
    });
    // 10:00 and 10:00+30 = 10:30 would end 11:15 > close, so only 10:00 today; next Monday 09:00, 09:30, 10:00
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-11-09T04:30:00.000Z",
      "2026-11-16T03:30:00.000Z",
      "2026-11-16T04:00:00.000Z",
      "2026-11-16T04:30:00.000Z",
    ]);
  });
});

describe("booking in WhatsApp", () => {
  it("books from a bot list, then reschedules and cancels by keyword", async () => {
    const o = await makeOrg();
    const svc = await bookableService(o);
    await liveFlow(o, "book", { id: "b", type: "booking", position: { x: 0, y: 0 }, data: { text: "Pick a time", serviceId: svc.id } });

    const r = await customerSays(o.number, "919811100001", "book");
    let thread = await messages(o, r.conversationId!);
    const list = thread[thread.length - 1];
    expect(list.type).toBe("list");
    const rows = list.payload.rows as string[];
    expect(rows.length).toBe(10);

    await customerSays(o.number, "919811100001", rows[1], "row:1");
    const [appt] = await o.d.select().from(schema.appointments).where(eq(schema.appointments.orgId, o.org.id));
    expect(appt.status).toBe("booked");
    thread = await messages(o, r.conversationId!);
    expect(thread.map((m) => m.body).join("\n")).toMatch(/You're booked: Check-up/);
    expect(thread[thread.length - 1].body).toBe("Anything else?");

    await customerSays(o.number, "919811100001", "RESCHEDULE");
    thread = await messages(o, r.conversationId!);
    expect(thread[thread.length - 1].body).toMatch(/Pick a new time/);
    await customerSays(o.number, "919811100001", "pick 3", "row:3");
    const after = await o.d.select().from(schema.appointments).where(eq(schema.appointments.orgId, o.org.id)).orderBy(asc(schema.appointments.createdAt));
    expect(after.map((a) => a.status)).toEqual(["cancelled", "booked"]);

    await customerSays(o.number, "919811100001", "cancel");
    const final = await o.d.select().from(schema.appointments).where(and(eq(schema.appointments.orgId, o.org.id), eq(schema.appointments.status, "booked")));
    expect(final).toHaveLength(0);
  });

  it("never double-books a slot past its capacity", async () => {
    const o = await makeOrg();
    const svc = await bookableService(o);
    const { bookAppointment } = await import("@/lib/booking");
    const [c1] = await o.d.insert(schema.contacts).values({ orgId: o.org.id, waId: "919811100010" }).returning();
    const [c2] = await o.d.insert(schema.contacts).values({ orgId: o.org.id, waId: "919811100011" }).returning();
    const at = new Date(Date.now() + 86400_000);
    await bookAppointment(o.d, { orgId: o.org.id, serviceId: svc.id, contactId: c1.id, conversationId: null, startAt: at, source: "staff" });
    await expect(bookAppointment(o.d, { orgId: o.org.id, serviceId: svc.id, contactId: c2.id, conversationId: null, startAt: new Date(at.getTime() + 10 * 60_000), source: "staff" })).rejects.toThrow(/just taken/);
  });
});

describe("orders and payments", () => {
  it("takes an order in chat, sends a sandbox payment link, and confirms on payment once", async () => {
    const o = await makeOrg();
    const [p] = await o.d.insert(schema.products).values({ orgId: o.org.id, name: "Whitening kit", priceMinor: 1499_00, stock: 3 }).returning();
    await liveFlow(o, "shop", { id: "p", type: "products", position: { x: 0, y: 0 }, data: { text: "What would you like?" } });

    const r = await customerSays(o.number, "919811100002", "shop");
    await customerSays(o.number, "919811100002", "Whitening kit", "row:0");
    const [order] = await o.d.select().from(schema.orders).where(eq(schema.orders.orgId, o.org.id));
    expect(order.totalMinor).toBe(1499_00);
    expect(order.paymentProvider).toBe("sandbox");
    expect(order.paymentStatus).toBe("link_sent");
    const [stock] = await o.d.select({ stock: schema.products.stock }).from(schema.products).where(eq(schema.products.id, p.id));
    expect(stock.stock).toBe(2);
    const thread = await messages(o, r.conversationId!);
    expect(thread.some((m) => m.body?.includes(`/pay/${order.id}`))).toBe(true);

    expect(await markPaid(o.d, order.id, "sandbox")).toBe(true);
    expect(await markPaid(o.d, order.id, "sandbox")).toBe(false);
    const [paid] = await o.d.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(paid.status).toBe("confirmed");
    const confirmations = (await messages(o, r.conversationId!)).filter((m) => m.body?.startsWith("Payment received"));
    expect(confirmations).toHaveLength(1);
  });

  it("refuses an order for more than is in stock", async () => {
    const o = await makeOrg();
    const [p] = await o.d.insert(schema.products).values({ orgId: o.org.id, name: "Brush", priceMinor: 99_00, stock: 1 }).returning();
    const [c] = await o.d.insert(schema.contacts).values({ orgId: o.org.id, waId: "919811100003" }).returning();
    await expect(createOrder(o.d, { orgId: o.org.id, contactId: c.id, conversationId: null, lines: [{ productId: p.id, qty: 2 }], source: "test" })).rejects.toThrow(/Only 1/);
  });

  it("verifies Razorpay and Stripe webhook signatures", () => {
    const body = JSON.stringify({ event: "payment_link.paid" });
    const rzp = createHmac("sha256", "rzp_secret").update(body).digest("hex");
    expect(verifyRazorpay(body, rzp, "rzp_secret")).toBe(true);
    expect(verifyRazorpay(body, rzp, "other")).toBe(false);
    expect(verifyRazorpay(body + " ", rzp, "rzp_secret")).toBe(false);

    const t = 1_800_000_000;
    const v1 = createHmac("sha256", "whsec_x").update(`${t}.${body}`).digest("hex");
    expect(verifyStripe(body, `t=${t},v1=${v1}`, "whsec_x", t + 10)).toBe(true);
    expect(verifyStripe(body, `t=${t},v1=${v1}`, "whsec_x", t + 1000)).toBe(false); // replayed too late
    expect(verifyStripe(body, `t=${t},v1=deadbeef`, "whsec_x", t)).toBe(false);
  });
});

describe("automations", () => {
  it("runs steps after a wait and logs each one", async () => {
    const o = await makeOrg();
    await o.d.insert(schema.automations).values({
      orgId: o.org.id,
      name: "Thank you",
      trigger: "order_paid",
      status: "live",
      steps: [
        { type: "add_tag", tag: "customer" },
        { type: "wait", minutes: 60 },
        { type: "if_tag", tag: "customer" },
        { type: "send_text", text: "Thanks {name}! How was it?" },
      ],
    });
    const r = await customerSays(o.number, "919811100004", "hi");
    const [conv] = await o.d.select().from(schema.conversations).where(eq(schema.conversations.id, r.conversationId!));
    const [p] = await o.d.insert(schema.products).values({ orgId: o.org.id, name: "Floss", priceMinor: 50_00 }).returning();
    const order = await createOrder(o.d, { orgId: o.org.id, contactId: conv.contactId, conversationId: conv.id, lines: [{ productId: p.id, qty: 1 }], source: "test" });
    await markPaid(o.d, order.id, "test");
    await drainJobs();
    const [run] = await o.d.select().from(schema.automationRuns).where(eq(schema.automationRuns.orgId, o.org.id));
    expect(run.status).toBe("done");
    expect(run.log.map((l) => l.detail)).toEqual(["Tagged customer", "Waiting 60 min", "Tagged customer: continue", "Sent message"]);
    const thread = await messages(o, conv.id);
    expect(thread[thread.length - 1].body).toBe("Thanks Asha Kumar! How was it?");

    // the same order paying again (duplicate webhook) never starts a second run
    await emit(o.d, o.org.id, "order.paid", {}, { contactId: conv.contactId, conversationId: conv.id, key: `order-paid:${order.id}` });
    expect(await o.d.select().from(schema.automationRuns).where(eq(schema.automationRuns.orgId, o.org.id))).toHaveLength(1);
  });
});

describe("outbound webhooks", () => {
  it("delivers signed events and retries failures", async () => {
    const o = await makeOrg();
    const secret = "whsec_test";
    await o.d.insert(schema.webhookEndpoints).values({ orgId: o.org.id, url: "https://hooks.example.com/wf", secretEnc: encrypt(secret), events: ["contact.created"] });
    const calls: { headers: Headers; body: string }[] = [];
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ headers: new Headers(init.headers), body: String(init.body) });
        const status = fail ? 500 : 200;
        fail = false;
        return new Response("", { status });
      }),
    );
    await customerSays(o.number, "919811100005", "hello");
    await drainJobs();
    const [del] = await o.d.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.orgId, o.org.id));
    expect(del.status).toBe("ok");
    expect(del.attempts).toBe(2);
    const last = calls[calls.length - 1];
    const ts = Number(last.headers.get("x-whatsflow-timestamp"));
    expect(last.headers.get("x-whatsflow-signature")).toBe(signWebhook(secret, ts, last.body));
    expect(JSON.parse(last.body).data.contact.phone).toBe("919811100005");
  });

  it("refuses private network addresses in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(assertPublicUrl("https://127.0.0.1/x")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("https://[::1]/x")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("https://10.1.2.3/x")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("http://example.com/x")).rejects.toThrow(/https/);
  });
});

describe("developer API", () => {
  it("authenticates by key, scopes to the workspace and sends inside the window", async () => {
    const o = await makeOrg();
    const other = await makeOrg("Other");
    const k = newApiKey();
    await o.d.insert(schema.apiKeys).values({ orgId: o.org.id, name: "test", prefix: k.prefix, keyHash: k.hash, scope: "full" });
    await customerSays(o.number, "919811100006", "hi there");
    await customerSays(other.number, "919811100099", "not yours");
    const auth = { authorization: `Bearer ${k.key}`, "content-type": "application/json" };

    const unauth = (await listContacts(new Request("http://x/api/v1/contacts")))!;
    expect(unauth.status).toBe(401);
    const list = await (await listContacts(new Request("http://x/api/v1/contacts", { headers: auth })))!.json();
    expect(list.data.map((c: { phone: string }) => c.phone)).toEqual(["919811100006"]);

    const sent = (await sendViaApi(new Request("http://x/api/v1/messages", { method: "POST", headers: auth, body: JSON.stringify({ to: "+91 98111 00006", text: "Your order shipped" }) })))!;
    expect(sent.status).toBe(201);
    const closed = (await sendViaApi(new Request("http://x/api/v1/messages", { method: "POST", headers: auth, body: JSON.stringify({ to: "+919811100777", text: "Cold message" }) })))!;
    expect(closed.status).toBe(422);
    expect((await closed.json()).error.message).toMatch(/24-hour/);
  });
});

describe("AI replies", () => {
  it("answers from business info, and hands over when unsure or asked", async () => {
    const o = await makeOrg();
    await o.d.insert(schema.aiSettings).values({ orgId: o.org.id, enabled: true, businessInfo: "Open 9 to 6. Parking behind the building." });
    await o.d.update(schema.inboxSettings).set({ welcomeEnabled: false, awayEnabled: false }).where(eq(schema.inboxSettings.orgId, o.org.id));
    const seen: string[] = [];
    setAiClientForTests(async (system, msgs) => {
      seen.push(system);
      const last = String(msgs[msgs.length - 1].content);
      return last.includes("parking") ? "Yes, there's parking behind the building." : "[HANDOVER]";
    });
    const r = await customerSays(o.number, "919811100007", "Is there parking?");
    let thread = await messages(o, r.conversationId!);
    expect(thread[thread.length - 1].body).toBe("Yes, there's parking behind the building.");
    expect(seen[0]).toContain("Parking behind the building");

    await customerSays(o.number, "919811100007", "Can I get a refund for last week?");
    thread = await messages(o, r.conversationId!);
    expect(thread[thread.length - 1].body).toMatch(/someone from our team/);
    const [conv] = await o.d.select().from(schema.conversations).where(eq(schema.conversations.id, r.conversationId!));
    expect(conv.handledBy).toBe("human");

    // once a person has it, the AI stays out
    await customerSays(o.number, "919811100007", "and parking on Sunday?");
    expect((await messages(o, r.conversationId!)).filter((m) => m.senderKind === "bot")).toHaveLength(2);
  });

  it("builds a transcript that starts and ends with the customer", () => {
    expect(
      toTranscript([
        { direction: "out", body: "Welcome!" },
        { direction: "in", body: "hi" },
        { direction: "in", body: "price?" },
        { direction: "out", body: "" },
      ]),
    ).toEqual([{ role: "user", content: "hi\nprice?" }]);
  });
});
