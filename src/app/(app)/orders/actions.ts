"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { createOrder, logOrder, markPaid, OrderError, sendPaymentLink, setOrderStatus } from "@/lib/orders";
import { PaymentError } from "@/lib/payments";
import { SendError } from "@/lib/wa/outbound";

const STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

async function owned(id: string) {
  const ctx = await requireOrg();
  const [o] = await ctx.db.select().from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.orgId, ctx.org.id))).limit(1);
  if (!o) redirect("/orders");
  return { ctx, order: o };
}

export async function createOrderAction(form: FormData) {
  const ctx = await requireOrg();
  const contactId = String(form.get("contactId") ?? "");
  const [contact] = await ctx.db.select().from(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.orgId, ctx.org.id)));
  if (!contact) redirect("/orders?error=Pick+a+customer");
  const [conv] = await ctx.db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.contactId, contact.id)).limit(1);
  const lines = [...form.entries()]
    .filter(([k]) => k.startsWith("qty_"))
    .map(([k, v]) => ({ productId: k.slice(4), qty: Math.max(0, Math.min(999, Math.floor(Number(v)) || 0)) }))
    .filter((l) => l.qty > 0);
  let id: string;
  try {
    const order = await createOrder(ctx.db, {
      orgId: ctx.org.id,
      contactId: contact.id,
      conversationId: conv?.id ?? null,
      lines,
      source: "inbox",
      notes: String(form.get("notes") ?? "").trim() || null,
      actorId: ctx.user.id,
    });
    id = order.id;
    if (form.get("sendLink") === "on" && conv) await sendPaymentLink(ctx.db, order.id, { senderKind: "user", actorId: ctx.user.id });
  } catch (e) {
    if (e instanceof OrderError || e instanceof PaymentError || e instanceof SendError) {
      redirect(`/orders/new?contact=${contact.id}&error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  redirect(`/orders/${id}`);
}

export async function sendLinkAction(form: FormData) {
  const { ctx, order } = await owned(String(form.get("id")));
  try {
    await sendPaymentLink(ctx.db, order.id, { senderKind: "user", actorId: ctx.user.id });
  } catch (e) {
    if (e instanceof OrderError || e instanceof PaymentError || e instanceof SendError) redirect(`/orders/${order.id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/orders/${order.id}`);
  redirect(`/orders/${order.id}?sent=1`);
}

export async function setStatusAction(form: FormData) {
  const { ctx, order } = await owned(String(form.get("id")));
  const status = String(form.get("status")) as OrderStatus;
  if (!STATUSES.includes(status)) return;
  const r = await setOrderStatus(ctx.db, ctx.org.id, order.id, status, {
    actorId: ctx.user.id,
    notify: form.get("notify") === "on",
    tracking: String(form.get("tracking") ?? "").trim() || null,
  });
  revalidatePath(`/orders/${order.id}`);
  redirect(`/orders/${order.id}${form.get("notify") === "on" && !r.notified ? "?error=" + encodeURIComponent("Status saved, but the customer couldn't be messaged (24-hour window closed). A note was left in the chat.") : ""}`);
}

export async function markPaidAction(form: FormData) {
  const { ctx, order } = await owned(String(form.get("id")));
  if (ctx.role === "agent") redirect(`/orders/${order.id}?error=Only+owners+and+admins+can+mark+an+order+paid`);
  await markPaid(ctx.db, order.id, `manual entry by ${ctx.user.name}`);
  await logOrder(ctx.db, order.id, "note", "Marked paid by hand (cash, UPI or bank transfer)", ctx.user.id);
  revalidatePath(`/orders/${order.id}`);
}
