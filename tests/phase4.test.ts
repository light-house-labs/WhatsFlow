import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { customerSays, drainJobs, makeOrg } from "./helpers";
import { hashPassword, encrypt } from "@/lib/crypto";
import { detectLanguage } from "@/lib/routing";
import { checkAbandonedCart } from "@/lib/stores";
import { createOrder, remindPayment, sendPaymentLink, markPaid } from "@/lib/orders";
import { cloudProvider } from "@/lib/wa/cloud";
import { POST as storeWebhook } from "@/app/api/webhooks/store/[provider]/[orgId]/route";

type Org = Awaited<ReturnType<typeof makeOrg>>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function messages(o: Org, conversationId: string) {
  return o.d.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt));
}

describe("industry starter flows", () => {
  it("gives each new workspace a starter bot for its industry", async () => {
    const o = await makeOrg("Sunrise Homes", "Real estate");
    const [flow] = await o.d.select().from(schema.botFlows).where(eq(schema.botFlows.orgId, o.org.id));
    expect(flow.name).toBe("Real estate: qualify buyers");
    expect(flow.status).toBe("draft");
  });
});

describe("chat routing", () => {
  it("detects languages by script", () => {
    expect(detectLanguage("मुझे कीमत बताइए")).toBe("hi");
    expect(detectLanguage("വില എത്ര?")).toBe("ml");
    expect(detectLanguage("price please")).toBe("en");
    expect(detectLanguage("👍")).toBeNull();
  });

  it("assigns and labels new chats by keyword or language, first rule wins", async () => {
    const o = await makeOrg();
    const [agent] = await o.d.insert(schema.users).values({ email: `agent-${Date.now()}@example.test`, name: "Ravi", passwordHash: await hashPassword("pw-123456") }).returning();
    await o.d.insert(schema.memberships).values({ orgId: o.org.id, userId: agent.id, role: "agent" });
    await o.d.insert(schema.routingRules).values([
      { orgId: o.org.id, position: 0, match: "keyword", values: ["refund", "invoice"], assignMode: "user", assigneeId: agent.id, label: "billing" },
      { orgId: o.org.id, position: 1, match: "language", values: ["hi"], assignMode: "none", label: "hindi" },
    ]);
    const billing = await customerSays(o.number, "919811200001", "I want a refund please");
    const hindi = await customerSays(o.number, "919811200002", "नमस्ते, कीमत?");
    const plain = await customerSays(o.number, "919811200003", "hello");
    const conv = async (id: string) => (await o.d.select().from(schema.conversations).where(eq(schema.conversations.id, id)))[0];
    expect(await conv(billing.conversationId!)).toMatchObject({ assigneeId: agent.id, labels: ["billing"] });
    expect(await conv(hindi.conversationId!)).toMatchObject({ assigneeId: null, labels: ["hindi"] });
    expect(await conv(plain.conversationId!)).toMatchObject({ assigneeId: null, labels: [] });

    // only new chats are routed
    await customerSays(o.number, "919811200003", "and an invoice too");
    expect((await conv(plain.conversationId!)).assigneeId).toBeNull();
  });

  it("gives least-busy rules to the teammate with fewest open chats", async () => {
    const o = await makeOrg();
    const [agent] = await o.d.insert(schema.users).values({ email: `agent2-${Date.now()}@example.test`, name: "Meera", passwordHash: await hashPassword("pw-123456") }).returning();
    await o.d.insert(schema.memberships).values({ orgId: o.org.id, userId: agent.id, role: "agent" });
    await o.d.insert(schema.routingRules).values({ orgId: o.org.id, match: "keyword", values: ["help"], assignMode: "least_busy" });
    const first = await customerSays(o.number, "919811200011", "help");
    const second = await customerSays(o.number, "919811200012", "help");
    const owners = await o.d
      .select({ a: schema.conversations.assigneeId })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.orgId, o.org.id)));
    expect(new Set(owners.map((r) => r.a))).toEqual(new Set([o.user.id, agent.id]));
    expect(first.conversationId).not.toBe(second.conversationId);
  });
});

describe("store sync", () => {
  const secret = "shpss_test_secret_0123456789";

  async function connect(o: Org, kind: "shopify" | "woocommerce", extra: Record<string, unknown> = {}) {
    const config = { storeUrl: kind === "shopify" ? "demo.myshopify.com" : "https://shop.example.test", webhookSecret: secret, cartMinutes: 15, cartConsentOnly: true, ...extra };
    await o.d.insert(schema.integrations).values({ orgId: o.org.id, kind, configEnc: encrypt(JSON.stringify(config)), label: "test" });
  }

  function deliver(o: Org, kind: "shopify" | "woocommerce", topic: string, body: unknown, sign = secret) {
    const raw = JSON.stringify(body);
    const sig = createHmac("sha256", sign).update(raw).digest("base64");
    const headers: Record<string, string> =
      kind === "shopify" ? { "x-shopify-hmac-sha256": sig, "x-shopify-topic": topic } : { "x-wc-webhook-signature": sig, "x-wc-webhook-topic": topic };
    return storeWebhook(new Request("http://x", { method: "POST", headers, body: raw }), { params: Promise.resolve({ provider: kind, orgId: o.org.id }) });
  }

  const shopifyOrder = (extra: Record<string, unknown> = {}) => ({
    id: 5550001,
    name: "#1042",
    phone: "+91 98112 30001",
    email: "asha@example.test",
    customer: { first_name: "Asha", last_name: "Kumar" },
    line_items: [{ title: "Notebook", quantity: 2, price: "120.00" }],
    total_price: "240.00",
    currency: "INR",
    financial_status: "pending",
    fulfillment_status: null,
    checkout_token: "chk_1",
    ...extra,
  });

  it("imports Shopify orders, fires automations with order details, and is idempotent", async () => {
    const o = await makeOrg();
    await connect(o, "shopify");
    await o.d.insert(schema.automations).values({ orgId: o.org.id, name: "Paid", trigger: "order_paid", status: "live", steps: [{ type: "add_tag", tag: "paid-{order_number}" }] });

    expect((await deliver(o, "shopify", "orders/create", shopifyOrder(), "wrong-secret-xxxxxxxx")).status).toBe(401);
    const res = await deliver(o, "shopify", "orders/create", shopifyOrder());
    expect(await res.json()).toMatchObject({ created: true });
    await deliver(o, "shopify", "orders/create", shopifyOrder()); // Shopify retries

    const orders = await o.d.select().from(schema.orders).where(eq(schema.orders.orgId, o.org.id));
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ source: "shopify", externalId: "5550001", totalMinor: 240_00, paymentStatus: "unpaid", status: "confirmed" });
    const [contact] = await o.d.select().from(schema.contacts).where(eq(schema.contacts.id, orders[0].contactId));
    expect(contact).toMatchObject({ waId: "919811230001", name: "Asha Kumar", tags: ["shopify"] });

    await deliver(o, "shopify", "orders/updated", shopifyOrder({ financial_status: "paid" }));
    await deliver(o, "shopify", "orders/updated", shopifyOrder({ financial_status: "paid", fulfillment_status: "fulfilled", fulfillments: [{ tracking_url: "https://track.example/1" }] }));
    const [after] = await o.d.select().from(schema.orders).where(eq(schema.orders.id, orders[0].id));
    expect(after).toMatchObject({ paymentStatus: "paid", status: "shipped" });
    const [run] = await o.d.select().from(schema.automationRuns).where(eq(schema.automationRuns.orgId, o.org.id));
    expect(run.vars).toMatchObject({ order_number: String(after.number), store_order: "#1042" });
  });

  it("imports WooCommerce orders and accepts its unsigned setup ping", async () => {
    const o = await makeOrg();
    await connect(o, "woocommerce");
    const ping = await storeWebhook(new Request("http://x", { method: "POST", body: "webhook_id=12" }), { params: Promise.resolve({ provider: "woocommerce", orgId: o.org.id }) });
    expect(ping.status).toBe(200);
    await deliver(o, "woocommerce", "order.created", {
      id: 88,
      number: "88",
      status: "processing",
      total: "999.50",
      currency: "INR",
      date_paid: "2026-11-08T10:00:00",
      billing: { first_name: "Ravi", last_name: "S", phone: "9811230002", email: "ravi@example.test" },
      line_items: [{ name: "Tea", quantity: 1, price: 999.5 }],
    });
    const [order] = await o.d.select().from(schema.orders).where(eq(schema.orders.orgId, o.org.id));
    expect(order).toMatchObject({ source: "woocommerce", externalId: "88", totalMinor: 999_50, paymentStatus: "paid", status: "confirmed" });
  });

  it("reminds an abandoned Shopify checkout once, only with marketing consent, via a template", async () => {
    const o = await makeOrg();
    await connect(o, "shopify");
    const [tpl] = await o.d
      .insert(schema.templates)
      .values({ orgId: o.org.id, name: "cart_reminder", category: "MARKETING", body: "Hi {{1}}, you left something behind: {{2}}", status: "approved" })
      .returning();
    await o.d.insert(schema.automations).values({
      orgId: o.org.id,
      name: "Cart",
      trigger: "cart_abandoned",
      status: "live",
      steps: [{ type: "send_template", templateId: tpl.id, variables: ["name", "cart_url"] }],
    });
    const checkout = (token: string, phone: string, consent: boolean) => ({
      token,
      phone,
      buyer_accepts_marketing: consent,
      customer: { first_name: "Meera" },
      abandoned_checkout_url: `https://demo.myshopify.com/cart/${token}`,
      total_price: "500.00",
      currency: "INR",
    });
    await deliver(o, "shopify", "checkouts/create", checkout("tok_yes", "+919811230010", true));
    await deliver(o, "shopify", "checkouts/create", checkout("tok_no", "+919811230011", false));
    await deliver(o, "shopify", "checkouts/create", checkout("tok_done", "+919811230012", true));
    await deliver(o, "shopify", "orders/create", shopifyOrder({ id: 777, phone: "+919811230012", checkout_token: "tok_done" }));

    const carts = await o.d.select().from(schema.abandonedCarts).where(eq(schema.abandonedCarts.orgId, o.org.id));
    // pretend the carts went quiet long ago
    await o.d.update(schema.abandonedCarts).set({ updatedAt: new Date(Date.now() - 3600_000) }).where(eq(schema.abandonedCarts.orgId, o.org.id));
    const byToken = Object.fromEntries(carts.map((c) => [c.externalId, c.id]));
    expect(await checkAbandonedCart(o.d, byToken.tok_yes)).toBe(true);
    expect(await checkAbandonedCart(o.d, byToken.tok_yes)).toBe(false);
    expect(await checkAbandonedCart(o.d, byToken.tok_no)).toBe(false);
    expect(await checkAbandonedCart(o.d, byToken.tok_done)).toBe(false);
    await drainJobs();

    const [run] = await o.d.select().from(schema.automationRuns).where(eq(schema.automationRuns.orgId, o.org.id));
    expect(run.status).toBe("done");
    const thread = await messages(o, run.conversationId!);
    expect(thread.at(-1)?.body).toBe("Hi Meera, you left something behind: https://demo.myshopify.com/cart/tok_yes");
  });
});

describe("payment reminders", () => {
  it("nudges an unpaid payment link once, and not after payment", async () => {
    const o = await makeOrg();
    const r = await customerSays(o.number, "919811240001", "hi");
    const [conv] = await o.d.select().from(schema.conversations).where(eq(schema.conversations.id, r.conversationId!));
    const [p] = await o.d.insert(schema.products).values({ orgId: o.org.id, name: "Kit", priceMinor: 300_00 }).returning();
    const a = await createOrder(o.d, { orgId: o.org.id, contactId: conv.contactId, conversationId: conv.id, lines: [{ productId: p.id, qty: 1 }], source: "test" });
    const b = await createOrder(o.d, { orgId: o.org.id, contactId: conv.contactId, conversationId: conv.id, lines: [{ productId: p.id, qty: 1 }], source: "test" });
    const sentAt = Date.now() - 1000;
    await sendPaymentLink(o.d, a.id, { senderKind: "user" });
    await sendPaymentLink(o.d, b.id, { senderKind: "user" });
    await markPaid(o.d, b.id, "test");
    expect(await remindPayment(o.d, a.id, sentAt)).toBe(true);
    expect(await remindPayment(o.d, a.id, sentAt)).toBe(false);
    expect(await remindPayment(o.d, b.id, sentAt)).toBe(false);
    const reminders = (await messages(o, conv.id)).filter((m) => m.body?.startsWith("A gentle reminder"));
    expect(reminders).toHaveLength(1);
    const queued = await o.d.select().from(schema.jobs).where(eq(schema.jobs.kind, "order.payment_reminder"));
    expect(queued.length).toBeGreaterThanOrEqual(2);
  });
});

describe("business profile", () => {
  it("sends the profile to Meta and uploads a photo through the app", async () => {
    vi.stubEnv("META_APP_ID", "APP1");
    vi.stubEnv("NODE_ENV", "development");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url === "https://cdn.example.com/logo.png") return new Response(new Uint8Array([9, 9]), { headers: { "content-type": "image/png" } });
      if (url.includes("/APP1/uploads")) return new Response(JSON.stringify({ id: "upload:p" }));
      if (url.endsWith("/upload:p")) return new Response(JSON.stringify({ h: "PHOTO" }));
      bodies.push({ url, ...JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ success: true }));
    });
    const r = await cloudProvider({ phoneNumberId: "PN", wabaId: "W", accessToken: "t", lastWebhookAt: null }).updateProfile({
      about: "Open 9 to 7",
      website: "https://example.test",
      vertical: "HEALTH",
      photoUrl: "https://cdn.example.com/logo.png",
    });
    expect(r).toEqual({ ok: true });
    expect(bodies[0]).toMatchObject({ messaging_product: "whatsapp", about: "Open 9 to 7", websites: ["https://example.test"], vertical: "HEALTH", profile_picture_handle: "PHOTO" });
    expect(String(bodies[0].url)).toMatch(/\/PN\/whatsapp_business_profile$/);
  });
});

