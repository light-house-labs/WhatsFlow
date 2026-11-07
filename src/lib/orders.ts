import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { OrderItem, OrderStatus } from "@/db/schema";
import { formatMoney, limitsFor } from "./plans";
import { emit } from "./events";
import { createPaymentLink } from "./payments";
import { sendInConversation, SendError } from "./wa/outbound";

export class OrderError extends Error {}

export async function nextOrderNumber(d: DB, orgId: string) {
  const [r] = await d
    .select({ n: sql<number>`coalesce(max(${schema.orders.number}), 1000)` })
    .from(schema.orders)
    .where(eq(schema.orders.orgId, orgId));
  return Number(r.n) + 1;
}

export function orderTotal(items: OrderItem[]) {
  return items.reduce((s, i) => s + i.qty * i.priceMinor, 0);
}

export async function logOrder(d: DB, orderId: string, kind: string, detail: string | null, actorId?: string | null) {
  await d.insert(schema.orderEvents).values({ orderId, kind, detail, actorId: actorId ?? null });
}

/** Create an order from catalog products. Prices come from the catalog, never the caller. */
export async function createOrder(
  d: DB,
  o: {
    orgId: string;
    contactId: string;
    conversationId: string | null;
    lines: { productId: string; qty: number }[];
    source: string;
    notes?: string | null;
    actorId?: string | null;
  },
) {
  const lines = o.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new OrderError("Add at least one product.");
  const products = await d
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.orgId, o.orgId), inArray(schema.products.id, lines.map((l) => l.productId))));
  const items: OrderItem[] = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p || !p.active) throw new OrderError("A product in this order is no longer available.");
    if (p.stock !== null && p.stock < l.qty) throw new OrderError(`Only ${p.stock} of ${p.name} left.`);
    return { productId: p.id, name: p.name, qty: l.qty, priceMinor: p.priceMinor };
  });
  const currency = products[0]?.currency ?? "INR";
  const order = await d.transaction(async (tx) => {
    for (const l of lines) {
      await tx
        .update(schema.products)
        .set({ stock: sql`case when ${schema.products.stock} is null then null else ${schema.products.stock} - ${l.qty} end` })
        .where(eq(schema.products.id, l.productId));
    }
    const [row] = await tx
      .insert(schema.orders)
      .values({
        orgId: o.orgId,
        number: await nextOrderNumber(tx as unknown as DB, o.orgId),
        contactId: o.contactId,
        conversationId: o.conversationId,
        items,
        totalMinor: orderTotal(items),
        currency,
        source: o.source,
        notes: o.notes ?? null,
      })
      .returning();
    return row;
  });
  await logOrder(d, order.id, "created", `${items.length} item(s), ${formatMoney(order.totalMinor, currency)}`, o.actorId);
  await emit(d, o.orgId, "order.created", { order: orderJson(order) }, { contactId: order.contactId, conversationId: order.conversationId, key: `order:${order.id}` });
  return order;
}

export function orderJson(o: typeof schema.orders.$inferSelect) {
  return {
    id: o.id,
    number: o.number,
    contactId: o.contactId,
    items: o.items,
    total: o.totalMinor,
    currency: o.currency,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentUrl: o.paymentUrl,
    createdAt: o.createdAt.toISOString(),
  };
}

export function orderSummary(o: { number: number; items: OrderItem[]; totalMinor: number; currency: string }) {
  const lines = o.items.map((i) => `• ${i.qty} × ${i.name} — ${formatMoney(i.qty * i.priceMinor, o.currency)}`);
  return [`Order #${o.number}`, ...lines, `Total: ${formatMoney(o.totalMinor, o.currency)}`].join("\n");
}

async function loadOrder(d: DB, orderId: string) {
  const [row] = await d
    .select({ order: schema.orders, contact: schema.contacts })
    .from(schema.orders)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.orders.contactId))
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!row) throw new OrderError("Order not found");
  return row;
}

/** Create a payment link and send it in the order's conversation. */
export async function sendPaymentLink(d: DB, orderId: string, opts: { senderKind: "user" | "bot"; actorId?: string | null }) {
  const { order, contact } = await loadOrder(d, orderId);
  if (order.paymentStatus === "paid") throw new OrderError("This order is already paid.");
  let url = order.paymentUrl;
  if (!url) {
    const link = await createPaymentLink(d, order.orgId, {
      orderId: order.id,
      orderNumber: order.number,
      amountMinor: order.totalMinor,
      currency: order.currency,
      description: `Order #${order.number}: ${order.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}`,
      customerName: contact.name,
      customerPhone: contact.waId,
    });
    url = link.url;
    await d
      .update(schema.orders)
      .set({ paymentProvider: link.provider, paymentRef: link.ref, paymentUrl: link.url, updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));
    await logOrder(d, order.id, "payment_link", `${link.provider} link created`, opts.actorId);
  }
  if (order.conversationId) {
    await sendInConversation(
      d,
      order.conversationId,
      { kind: "text", body: `${orderSummary(order)}\n\nPay securely here: ${url}` },
      { senderKind: opts.senderKind, senderUserId: opts.actorId ?? null },
    );
    await d.update(schema.orders).set({ paymentStatus: "link_sent", updatedAt: new Date() }).where(and(eq(schema.orders.id, order.id), eq(schema.orders.paymentStatus, "unpaid")));
  }
  return url;
}

/** Record a payment. Idempotent: a repeated webhook does nothing. */
export async function markPaid(d: DB, orderId: string, source: string) {
  const [order] = await d
    .update(schema.orders)
    .set({
      paymentStatus: "paid",
      paidAt: new Date(),
      status: sql`case when ${schema.orders.status} = 'pending' then 'confirmed' else ${schema.orders.status} end`,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.orders.id, orderId), sql`${schema.orders.paymentStatus} <> 'paid'`))
    .returning();
  if (!order) return false;
  await logOrder(d, order.id, "paid", `Payment received via ${source}`);
  await notify(d, order, `Payment received for order #${order.number}. Thank you! We'll let you know when it ships.`);
  await emit(d, order.orgId, "order.paid", { order: orderJson(order) }, { contactId: order.contactId, conversationId: order.conversationId, key: `order-paid:${order.id}` });
  return true;
}

const STATUS_MESSAGES: Partial<Record<OrderStatus, (n: number) => string>> = {
  confirmed: (n) => `Your order #${n} is confirmed.`,
  shipped: (n) => `Good news: your order #${n} has shipped.`,
  delivered: (n) => `Your order #${n} was delivered. Reply here if anything isn't right.`,
  cancelled: (n) => `Your order #${n} has been cancelled. Reply here if you have questions.`,
};

export async function setOrderStatus(d: DB, orgId: string, orderId: string, status: OrderStatus, opts: { actorId?: string | null; notify: boolean; tracking?: string | null }) {
  const [before] = await d.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.orgId, orgId))).limit(1);
  if (!before || before.status === status) return { notified: false };
  const [order] = await d.update(schema.orders).set({ status, updatedAt: new Date() }).where(eq(schema.orders.id, orderId)).returning();
  if (status === "cancelled") {
    for (const i of order.items) {
      if (i.productId) {
        await d
          .update(schema.products)
          .set({ stock: sql`case when ${schema.products.stock} is null then null else ${schema.products.stock} + ${i.qty} end` })
          .where(eq(schema.products.id, i.productId));
      }
    }
  }
  await logOrder(d, order.id, status, opts.tracking ? `Tracking: ${opts.tracking}` : null, opts.actorId);
  await emit(d, orgId, "order.updated", { order: orderJson(order) });
  let notified = false;
  const text = STATUS_MESSAGES[status]?.(order.number);
  if (opts.notify && text) notified = await notify(d, order, opts.tracking ? `${text}\nTracking: ${opts.tracking}` : text);
  return { notified };
}

/** Message the customer if the 24-hour window allows; otherwise leave a note for the team. */
async function notify(d: DB, order: typeof schema.orders.$inferSelect, text: string) {
  if (!order.conversationId) return false;
  try {
    await sendInConversation(d, order.conversationId, { kind: "text", body: text }, { senderKind: "system" });
    return true;
  } catch (e) {
    if (!(e instanceof SendError)) throw e;
    await d.insert(schema.notes).values({
      orgId: order.orgId,
      conversationId: order.conversationId,
      body: `Couldn't message the customer about order #${order.number}: ${e.message}`,
    });
    return false;
  }
}

export async function assertCatalogRoom(d: DB, orgId: string, plan: Parameters<typeof limitsFor>[0]) {
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(schema.products).where(eq(schema.products.orgId, orgId));
  if (Number(n) >= limitsFor(plan).products) throw new OrderError(`Your plan allows ${limitsFor(plan).products} products. Upgrade to add more.`);
}
