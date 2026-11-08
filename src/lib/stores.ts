/* eslint-disable @typescript-eslint/no-explicit-any -- Shopify and WooCommerce webhook bodies are untyped JSON, read field by field */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { OrderItem, OrderStatus, StoreKind } from "@/db/schema";
import { decrypt } from "./crypto";
import { emit } from "./events";
import { enqueue } from "./jobs";
import { formatMoney } from "./plans";
import { logOrder, markPaid, nextOrderNumber, orderJson, orderVars, setOrderStatus } from "./orders";
import { toWaId } from "./phone";

export type StoreConfig = {
  /** Shopify: your-store.myshopify.com. WooCommerce: https://shop.example.com */
  storeUrl: string;
  webhookSecret: string;
  /** Minutes after a checkout stops changing before it counts as abandoned. */
  cartMinutes?: number;
  /** Only remind people who agreed to marketing at checkout. */
  cartConsentOnly?: boolean;
};

/** Both stores sign the raw body: base64 HMAC-SHA256 with the webhook secret. */
export function verifyStoreSignature(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("base64"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function storeConfigFor(d: DB, orgId: string, kind: StoreKind) {
  const [row] = await d
    .select()
    .from(schema.integrations)
    .where(and(eq(schema.integrations.orgId, orgId), eq(schema.integrations.kind, kind), eq(schema.integrations.active, true)))
    .limit(1);
  return row ? (JSON.parse(decrypt(row.configEnc)) as StoreConfig) : null;
}

const minor = (v: unknown) => Math.round(Number(v ?? 0) * 100);

type Customer = { phone: string | null; name: string | null; email: string | null; acceptsMarketing: boolean };

export type StoreOrder = {
  externalId: string;
  label: string;
  checkoutToken: string | null;
  customer: Customer;
  items: OrderItem[];
  totalMinor: number;
  currency: string;
  paid: boolean;
  status: OrderStatus;
  tracking: string | null;
};

function joinName(first?: string, last?: string) {
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

export function shopifyOrder(o: any): StoreOrder {
  const addr = o.shipping_address ?? o.billing_address ?? {};
  const fulfilled = o.fulfillment_status === "fulfilled";
  const tracking = o.fulfillments?.find((f: any) => f.tracking_url || f.tracking_number) ?? null;
  return {
    externalId: String(o.id),
    label: String(o.name ?? o.order_number ?? o.id),
    checkoutToken: o.checkout_token ?? null,
    customer: {
      phone: o.phone ?? o.customer?.phone ?? addr.phone ?? null,
      name: joinName(o.customer?.first_name ?? addr.first_name, o.customer?.last_name ?? addr.last_name),
      email: o.email ?? o.customer?.email ?? null,
      acceptsMarketing: Boolean(o.buyer_accepts_marketing),
    },
    items: (o.line_items ?? []).map((l: any) => ({ productId: null, name: String(l.title ?? l.name ?? "Item").slice(0, 120), qty: Number(l.quantity ?? 1), priceMinor: minor(l.price) })),
    totalMinor: minor(o.total_price),
    currency: String(o.currency ?? "INR"),
    paid: o.financial_status === "paid",
    status: o.cancelled_at ? "cancelled" : fulfilled ? "shipped" : "confirmed",
    tracking: tracking ? (tracking.tracking_url ?? tracking.tracking_number) : null,
  };
}

const WOO_STATUS: Record<string, OrderStatus> = {
  pending: "pending",
  "on-hold": "pending",
  processing: "confirmed",
  completed: "delivered",
  cancelled: "cancelled",
  refunded: "cancelled",
  failed: "cancelled",
};

export function wooOrder(o: any): StoreOrder {
  const b = o.billing ?? {};
  const s = o.shipping ?? {};
  return {
    externalId: String(o.id),
    label: `#${o.number ?? o.id}`,
    checkoutToken: null,
    customer: { phone: b.phone || s.phone || null, name: joinName(b.first_name ?? s.first_name, b.last_name ?? s.last_name), email: b.email ?? null, acceptsMarketing: false },
    items: (o.line_items ?? []).map((l: any) => ({ productId: null, name: String(l.name ?? "Item").slice(0, 120), qty: Number(l.quantity ?? 1), priceMinor: minor(l.price) })),
    totalMinor: minor(o.total),
    currency: String(o.currency ?? "INR"),
    paid: Boolean(o.date_paid) || o.status === "processing" || o.status === "completed",
    status: WOO_STATUS[o.status] ?? "pending",
    tracking: null,
  };
}

async function upsertContact(d: DB, orgId: string, source: StoreKind, c: Customer) {
  const waId = c.phone ? toWaId(c.phone) : null;
  if (!waId) return null;
  const [contact] = await d
    .insert(schema.contacts)
    .values({ orgId, waId, name: c.name, email: c.email, source, tags: [source] })
    .onConflictDoUpdate({
      target: [schema.contacts.orgId, schema.contacts.waId],
      set: {
        name: sql`coalesce(${schema.contacts.name}, excluded.name)`,
        email: sql`coalesce(${schema.contacts.email}, excluded.email)`,
        tags: sql`array(select distinct unnest(${schema.contacts.tags} || array[${source}]::text[]))`,
        updatedAt: new Date(),
      },
    })
    .returning({ ...getTableColumns(schema.contacts), inserted: sql<boolean>`(xmax = 0)` });
  if (contact.inserted) await emit(d, orgId, "contact.created", { contact: { id: contact.id, phone: contact.waId, name: contact.name, source } });
  return contact;
}

/**
 * Create or update our copy of a store order. New orders fire order.created
 * (and order.paid) so automations can confirm them on WhatsApp.
 */
export async function syncStoreOrder(d: DB, orgId: string, source: StoreKind, o: StoreOrder) {
  if (o.checkoutToken) {
    await d
      .update(schema.abandonedCarts)
      .set({ completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.abandonedCarts.orgId, orgId), eq(schema.abandonedCarts.source, source), eq(schema.abandonedCarts.externalId, o.checkoutToken)));
  }
  const [existing] = await d
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.orgId, orgId), eq(schema.orders.source, source), eq(schema.orders.externalId, o.externalId)))
    .limit(1);
  if (existing) {
    if (o.paid && existing.paymentStatus !== "paid") await markPaid(d, existing.id, source);
    if (o.status !== existing.status && !(o.status === "confirmed" && existing.status !== "pending")) {
      await setOrderStatus(d, orgId, existing.id, o.status, { notify: true, tracking: o.tracking });
    }
    return { orderId: existing.id, created: false };
  }
  const contact = await upsertContact(d, orgId, source, o.customer);
  if (!contact) return { orderId: null, created: false, skipped: "no phone number on the order" };
  const [conv] = await d.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, contact.id)).limit(1);
  const [order] = await d
    .insert(schema.orders)
    .values({
      orgId,
      number: await nextOrderNumber(d, orgId),
      contactId: contact.id,
      conversationId: conv?.id ?? null,
      items: o.items,
      totalMinor: o.totalMinor,
      currency: o.currency,
      status: o.status,
      paymentStatus: o.paid ? "paid" : "unpaid",
      paidAt: o.paid ? new Date() : null,
      source,
      externalId: o.externalId,
      notes: `${source === "shopify" ? "Shopify" : "WooCommerce"} order ${o.label}`,
    })
    .onConflictDoNothing()
    .returning();
  if (!order) return { orderId: null, created: false }; // a duplicate delivery won the race
  await logOrder(d, order.id, "created", `Synced from ${source === "shopify" ? "Shopify" : "WooCommerce"} (${o.label})`);
  const subject = (key: string) => ({ contactId: contact.id, conversationId: order.conversationId, key, vars: orderVars(order) });
  await emit(d, orgId, "order.created", { order: orderJson(order) }, subject(`order:${order.id}`));
  if (o.paid) await emit(d, orgId, "order.paid", { order: orderJson(order) }, subject(`order-paid:${order.id}`));
  return { orderId: order.id, created: true };
}

/** Record a Shopify checkout. If it isn't completed within the configured time, it's an abandoned cart. */
export async function syncShopifyCheckout(d: DB, orgId: string, c: any, cfg: StoreConfig) {
  const token = c.token ?? c.cart_token;
  if (!token) return null;
  const addr = c.shipping_address ?? c.billing_address ?? {};
  const contact = await upsertContact(d, orgId, "shopify", {
    phone: c.phone ?? c.customer?.phone ?? addr.phone ?? null,
    name: joinName(c.customer?.first_name ?? addr.first_name, c.customer?.last_name ?? addr.last_name),
    email: c.email ?? null,
    acceptsMarketing: Boolean(c.buyer_accepts_marketing),
  });
  const values = {
    contactId: contact?.id ?? null,
    url: c.abandoned_checkout_url ?? null,
    totalMinor: minor(c.total_price),
    currency: String(c.currency ?? c.presentment_currency ?? "INR"),
    acceptsMarketing: Boolean(c.buyer_accepts_marketing),
    completedAt: c.completed_at ? new Date(c.completed_at) : null,
    updatedAt: new Date(),
  };
  const [cart] = await d
    .insert(schema.abandonedCarts)
    .values({ orgId, source: "shopify", externalId: String(token), ...values })
    .onConflictDoUpdate({ target: [schema.abandonedCarts.orgId, schema.abandonedCarts.source, schema.abandonedCarts.externalId], set: values })
    .returning();
  if (!cart.completedAt && cart.contactId) await enqueue(d, "store.cart_check", { cartId: cart.id }, Math.max(15, cfg.cartMinutes ?? 60) * 60_000);
  return cart;
}

/** Runs some time after the last checkout update. Fires cart.abandoned once per cart. */
export async function checkAbandonedCart(d: DB, cartId: string) {
  const [cart] = await d.select().from(schema.abandonedCarts).where(eq(schema.abandonedCarts.id, cartId)).limit(1);
  if (!cart || cart.completedAt || cart.remindedAt || !cart.contactId) return false;
  const cfg = await storeConfigFor(d, cart.orgId, cart.source);
  if (!cfg) return false;
  const quietFor = Date.now() - cart.updatedAt.getTime();
  if (quietFor < Math.max(15, cfg.cartMinutes ?? 60) * 60_000 - 5_000) return false; // a later update re-queued us
  if ((cfg.cartConsentOnly ?? true) && !cart.acceptsMarketing) return false;
  const [claimed] = await d
    .update(schema.abandonedCarts)
    .set({ remindedAt: new Date() })
    .where(and(eq(schema.abandonedCarts.id, cart.id), sql`${schema.abandonedCarts.remindedAt} is null`))
    .returning({ id: schema.abandonedCarts.id });
  if (!claimed) return false;
  const vars = { cart_url: cart.url ?? "", cart_total: formatMoney(cart.totalMinor, cart.currency) };
  await emit(d, cart.orgId, "cart.abandoned", { cart: { id: cart.id, source: cart.source, url: cart.url, total: cart.totalMinor, currency: cart.currency, contactId: cart.contactId } }, { contactId: cart.contactId, key: `cart:${cart.id}`, vars });
  return true;
}
