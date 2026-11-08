/* eslint-disable @typescript-eslint/no-explicit-any -- Meta webhook and Graph API bodies are untyped JSON, read defensively field by field */
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { isOpen } from "@/lib/hours";
import { runBot } from "@/lib/flows/engine";
import { aiReply } from "@/lib/ai";
import { emit } from "@/lib/events";
import { routeConversation } from "@/lib/routing";
import { availableSlots, bookAppointment, BookingError, cancelAppointment, nextAppointment, slotLabel } from "@/lib/booking";
import { sendInConversation, windowOpen } from "./outbound";
import type { WaNumber } from "./index";

export type InboundMessage = {
  waMessageId: string;
  from: string;
  profileName?: string | null;
  type: string;
  text: string;
  replyId?: string | null;
  media?: { id: string; mimeType?: string; filename?: string } | null;
  timestamp: Date;
  referral?: Record<string, unknown> | null;
};

/**
 * Everything that happens when a customer messages a connected number.
 * Idempotent on waMessageId: a retried webhook is a no-op.
 */
export async function handleInbound(d: DB, number: WaNumber, m: InboundMessage, opts: { testFlowId?: string } = {}) {
  const [dupe] = await d
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.waMessageId, m.waMessageId))
    .limit(1);
  if (dupe) return { duplicate: true as const };

  const orgId = number.orgId;
  const now = m.timestamp;

  const [contact] = await d
    .insert(schema.contacts)
    .values({
      orgId,
      waId: m.from,
      name: m.profileName ?? null,
      source: m.referral ? "ad" : "whatsapp",
      lastInboundAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.contacts.orgId, schema.contacts.waId],
      set: {
        lastInboundAt: now,
        name: sql`coalesce(${schema.contacts.name}, excluded.name)`,
        updatedAt: new Date(),
      },
    })
    .returning({ ...getTableColumns(schema.contacts), inserted: sql<boolean>`(xmax = 0)` });
  if (contact.inserted) {
    await emit(d, orgId, "contact.created", { contact: { id: contact.id, phone: contact.waId, name: contact.name, source: contact.source } });
  }

  const [existing] = await d
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.contactId, contact.id), eq(schema.conversations.numberId, number.id)))
    .limit(1);

  // A "new thread" is a first message, a message after the conversation was closed,
  // or the first message after 24 hours of silence. Each new thread is an enquiry.
  const isNewThread = !existing || existing.status === "closed" || !windowOpen(existing.lastInboundAt, now.getTime());

  let conv = existing;
  if (!conv) {
    [conv] = await d
      .insert(schema.conversations)
      .values({ orgId, contactId: contact.id, numberId: number.id, handledBy: "bot", lastInboundAt: now, lastMessageAt: now })
      .returning();
  }

  const [inserted] = await d.insert(schema.messages).values({
    orgId,
    conversationId: conv.id,
    direction: "in",
    type: m.type,
    body: m.text,
    payload: { ...(m.replyId ? { replyId: m.replyId } : {}), ...(m.media ? { media: m.media } : {}) },
    waMessageId: m.waMessageId,
    status: "received",
    senderKind: "contact",
    createdAt: now,
  }).returning({ id: schema.messages.id });
  await emit(d, orgId, "message.received", {
    message: { id: inserted.id, conversationId: conv.id, from: m.from, type: m.type, text: m.text, at: now.toISOString() },
  });

  await d
    .update(schema.conversations)
    .set({
      status: "open",
      lastInboundAt: now,
      lastMessageAt: now,
      lastMessagePreview: m.text.slice(0, 120),
      unreadCount: sql`${schema.conversations.unreadCount} + 1`,
      waitingSince: sql`coalesce(${schema.conversations.waitingSince}, ${now.toISOString()}::timestamptz)`,
      ...(existing?.status === "closed" ? { handledBy: "bot" as const, assigneeId: null, closedAt: null } : {}),
      ...(isNewThread ? { aiReplies: 0 } : {}),
    })
    .where(eq(schema.conversations.id, conv.id));

  // campaign reply attribution
  await d.execute(sql`
    update campaign_recipients set status = 'replied'
    where contact_id = ${contact.id} and status in ('sent','delivered','read')
      and campaign_id in (select id from campaigns where org_id = ${orgId} and sent_at > now() - interval '7 days')`);

  const [settings] = await d.select().from(schema.inboxSettings).where(eq(schema.inboxSettings.orgId, orgId)).limit(1);
  const [org] = await d.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);

  // Opt-out keywords always win.
  const keywords = settings?.optOutKeywords ?? ["STOP"];
  if (keywords.some((k) => k.toLowerCase() === m.text.trim().toLowerCase())) {
    await d.update(schema.contacts).set({ optedOutAt: now }).where(eq(schema.contacts.id, contact.id));
    await sendInConversation(
      d,
      conv.id,
      { kind: "text", body: "You've been unsubscribed from offers. You'll still get replies when you message us. Send START to subscribe again." },
      { senderKind: "system" },
    );
    return { duplicate: false as const, conversationId: conv.id, optedOut: true };
  }
  if (m.text.trim().toUpperCase() === "START" && contact.optedOutAt) {
    await d.update(schema.contacts).set({ optedOutAt: null }).where(eq(schema.contacts.id, contact.id));
  }

  // reopened chats were unassigned above, so they get routed again
  if (isNewThread && (!existing?.assigneeId || existing.status === "closed")) await routeConversation(d, orgId, conv.id, m.text);

  if (isNewThread) {
    await emit(d, orgId, "conversation.started", { conversation: { id: conv.id, contactId: contact.id, from: m.from } }, { contactId: contact.id, conversationId: conv.id, key: `conv:${conv.id}:${now.getTime()}` });
    await d.insert(schema.enquiries).values({
      orgId,
      contactId: contact.id,
      conversationId: conv.id,
      topic: m.text.slice(0, 140) || `(${m.type})`,
      source: m.referral ? "ad" : "whatsapp",
      status: "needs_human",
      createdAt: now,
    });
  }

  if (org && org.billingStatus !== "cancelled" && !opts.testFlowId) {
    const handled = await handleBookingReply(d, { orgId, timeZone: org.timezone, conversationId: conv.id, contactId: contact.id, text: m.text, replyId: m.replyId ?? null, pending: existing?.pending ?? null });
    if (handled) return { duplicate: false as const, conversationId: conv.id, optedOut: false };
  }

  let bot = org?.billingStatus === "cancelled" ? { handled: false, handedOver: false } : await runBot(d, {
    orgId,
    conversationId: conv.id,
    contactId: contact.id,
    text: m.text,
    replyId: m.replyId,
    isNewConversation: isNewThread,
    handledBy: existing?.status === "closed" ? "bot" : (conv.handledBy ?? "bot"),
    forceFlowId: opts.testFlowId,
  });

  if (!bot.handled && org?.billingStatus !== "cancelled") {
    bot = await aiReply(d, { orgId, conversationId: conv.id, text: m.text, isNewThread });
  }

  if (bot.handled && !bot.handedOver) {
    await d
      .update(schema.enquiries)
      .set({ status: "answered_by_bot", firstResponseSeconds: 0 })
      .where(and(eq(schema.enquiries.conversationId, conv.id), eq(schema.enquiries.status, "needs_human")));
    await d.update(schema.conversations).set({ waitingSince: null }).where(eq(schema.conversations.id, conv.id));
  }

  if (!bot.handled) {
    // nobody automated is answering: this is a person's job now
    await d.update(schema.conversations).set({ handledBy: "human" }).where(eq(schema.conversations.id, conv.id));
  }

  if (!bot.handled && isNewThread && settings && org) {
    const open = isOpen(settings.businessHours, org.timezone, now);
    const text = open ? (settings.welcomeEnabled ? settings.welcomeMessage : null) : settings.awayEnabled ? settings.awayMessage : null;
    if (text) await sendInConversation(d, conv.id, { kind: "text", body: text }, { senderKind: "system" });
  }

  return { duplicate: false as const, conversationId: conv.id, optedOut: false };
}

/**
 * Customers manage their booking by replying CANCEL or RESCHEDULE, then picking a
 * new time from the list we send. Returns true when the message was about that.
 */
async function handleBookingReply(
  d: DB,
  a: { orgId: string; timeZone: string; conversationId: string; contactId: string; text: string; replyId: string | null; pending: typeof schema.conversations.$inferSelect["pending"] },
) {
  const say = (body: string) => sendInConversation(d, a.conversationId, { kind: "text", body }, { senderKind: "system" });
  if (a.pending?.kind === "reschedule") {
    await d.update(schema.conversations).set({ pending: null }).where(eq(schema.conversations.id, a.conversationId));
    const idx = a.replyId?.match(/^row:(\d+)$/) ? Number(a.replyId.slice(4)) : Number(a.text.trim()) - 1;
    const pick = Number.isInteger(idx) ? a.pending.slots[idx] : undefined;
    if (!pick) return false; // not a pick: treat as a normal message
    try {
      const { appt, service } = await bookAppointment(d, { orgId: a.orgId, serviceId: a.pending.serviceId, contactId: a.contactId, conversationId: a.conversationId, startAt: new Date(pick), source: "reschedule" });
      await cancelAppointment(d, a.orgId, a.pending.appointmentId);
      await say(`Done. Your ${service.name} is now on ${slotLabel(appt.startAt, a.timeZone)}.`);
    } catch (e) {
      if (!(e instanceof BookingError)) throw e;
      await say(`${e.message} Reply RESCHEDULE to see the latest times.`);
    }
    return true;
  }
  const word = a.text.trim().toUpperCase();
  if (word !== "CANCEL" && word !== "RESCHEDULE") return false;
  const next = await nextAppointment(d, a.orgId, a.contactId);
  if (!next) return false;
  const when = slotLabel(next.a.startAt, a.timeZone);
  if (word === "CANCEL") {
    await cancelAppointment(d, a.orgId, next.a.id);
    await say(`Your ${next.service.name} on ${when} is cancelled. Reply here any time to book again.`);
    return true;
  }
  const slots = (await availableSlots(d, a.orgId, next.service.id, 10)).filter((x) => x.getTime() !== next.a.startAt.getTime());
  if (!slots.length) {
    await say(`There are no other free times online right now. Your ${next.service.name} on ${when} is still booked; our team will be in touch.`);
    return true;
  }
  await d
    .update(schema.conversations)
    .set({ pending: { kind: "reschedule", appointmentId: next.a.id, serviceId: next.service.id, slots: slots.map((x) => x.toISOString()) } })
    .where(eq(schema.conversations.id, a.conversationId));
  await sendInConversation(
    d,
    a.conversationId,
    { kind: "list", body: `Your ${next.service.name} is on ${when}. Pick a new time:`, button: "See times", rows: slots.map((x) => slotLabel(x, a.timeZone)) },
    { senderKind: "system" },
  );
  return true;
}

/** Parse a Meta Cloud API webhook body into messages and statuses. */
export function parseCloudWebhook(body: any) {
  const out: {
    phoneNumberId: string;
    messages: InboundMessage[];
    statuses: { id: string; status: "sent" | "delivered" | "read" | "failed"; error?: string }[];
  }[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!v?.metadata?.phone_number_id) continue;
      const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
      const messages: InboundMessage[] = (v.messages ?? []).map((msg: any) => {
        let text = "";
        let replyId: string | null = null;
        let media: InboundMessage["media"] = null;
        switch (msg.type) {
          case "text":
            text = msg.text?.body ?? "";
            break;
          case "button":
            text = msg.button?.text ?? "";
            replyId = msg.button?.payload ?? null;
            break;
          case "interactive":
            text = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "";
            replyId = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? null;
            break;
          case "image":
          case "video":
          case "document":
          case "audio":
          case "sticker":
            text = msg[msg.type]?.caption ?? `[${msg.type}]`;
            media = msg[msg.type]?.id ? { id: msg[msg.type].id, mimeType: msg[msg.type].mime_type, filename: msg[msg.type].filename } : null;
            break;
          case "location":
            text = `[location] ${msg.location?.latitude},${msg.location?.longitude}`;
            break;
          default:
            text = `[${msg.type}]`;
        }
        return {
          waMessageId: msg.id,
          from: msg.from,
          profileName: names.get(msg.from) ?? null,
          type: msg.type,
          text,
          replyId,
          media,
          timestamp: new Date(Number(msg.timestamp) * 1000),
          referral: msg.referral ?? null,
        };
      });
      const statuses = (v.statuses ?? []).map((s: any) => ({
        id: s.id,
        status: s.status,
        error: s.errors?.[0]?.title ?? s.errors?.[0]?.message,
      }));
      out.push({ phoneNumberId: v.metadata.phone_number_id, messages, statuses });
    }
  }
  return out;
}
