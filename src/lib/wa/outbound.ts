import { eq, and, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { enqueue, kickJobs } from "@/lib/jobs";
import { providerFor } from "./index";
import { MAX_BUTTONS, MAX_BUTTON_CHARS, MAX_LIST_ROWS, previewText, type Outbound } from "./types";

export const WINDOW_MS = 24 * 3600_000;

export function windowOpen(lastInboundAt: Date | null, now = Date.now()): boolean {
  return Boolean(lastInboundAt && now - lastInboundAt.getTime() < WINDOW_MS);
}

type SendOpts = {
  senderKind: "user" | "bot" | "system" | "campaign";
  senderUserId?: string | null;
  templateId?: string | null;
  campaignId?: string | null;
};

export class SendError extends Error {}

/**
 * Send a message in a conversation. Writes the message row first (queued), then
 * calls the provider, then records the result. Enforces WhatsApp's 24-hour rule
 * and opt-outs.
 */
export async function sendInConversation(d: DB, conversationId: string, msg: Outbound, opts: SendOpts) {
  const [row] = await d
    .select({ conv: schema.conversations, contact: schema.contacts, number: schema.waNumbers })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .innerJoin(schema.waNumbers, eq(schema.waNumbers.id, schema.conversations.numberId))
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (!row) throw new SendError("Conversation not found");
  const { conv, contact, number } = row;

  if (msg.kind !== "template" && !windowOpen(conv.lastInboundAt)) {
    throw new SendError("The 24-hour reply window is closed. Send an approved template instead.");
  }
  if (msg.kind === "template" && msg.template.category === "MARKETING" && contact.optedOutAt) {
    throw new SendError("This contact opted out of marketing messages.");
  }
  if (msg.kind === "buttons") {
    msg = { ...msg, buttons: msg.buttons.slice(0, MAX_BUTTONS).map((b) => b.slice(0, MAX_BUTTON_CHARS)) };
  }
  if (msg.kind === "list") msg = { ...msg, rows: msg.rows.slice(0, MAX_LIST_ROWS) };

  const body = previewText(msg);
  const [message] = await d
    .insert(schema.messages)
    .values({
      orgId: conv.orgId,
      conversationId,
      direction: "out",
      type: msg.kind,
      body,
      payload:
        msg.kind === "buttons"
          ? { buttons: msg.buttons }
          : msg.kind === "list"
            ? { rows: msg.rows, button: msg.button }
            : msg.kind === "media"
              ? { mediaType: msg.mediaType, link: msg.link, caption: msg.caption ?? null }
              : {},
      status: "queued",
      senderKind: opts.senderKind,
      senderUserId: opts.senderUserId ?? null,
      templateId: opts.templateId ?? null,
      campaignId: opts.campaignId ?? null,
    })
    .returning();

  const result = await providerFor(number).send(contact.waId, msg);
  const now = new Date();
  if (result.ok) {
    await d
      .update(schema.messages)
      .set({ status: "sent", waMessageId: result.waMessageId })
      .where(eq(schema.messages.id, message.id));
    if (number.provider === "sandbox") {
      await enqueue(d, "sandbox.status", { waMessageId: result.waMessageId, status: "delivered" }, 800);
      kickJobs(d);
    }
  } else {
    await d.update(schema.messages).set({ status: "failed", error: result.error }).where(eq(schema.messages.id, message.id));
  }

  const humanReply = opts.senderKind === "user";
  await d
    .update(schema.conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 120),
      ...(humanReply ? { waitingSince: null, unreadCount: 0, handledBy: "human" as const } : {}),
    })
    .where(eq(schema.conversations.id, conversationId));

  if (humanReply) {
    // first human answer on an open enquiry
    const [enq] = await d
      .select()
      .from(schema.enquiries)
      .where(
        and(
          eq(schema.enquiries.conversationId, conversationId),
          eq(schema.enquiries.status, "needs_human"),
          isNull(schema.enquiries.firstResponseSeconds),
        ),
      )
      .limit(1);
    if (enq) {
      await d
        .update(schema.enquiries)
        .set({ status: "answered", firstResponseSeconds: Math.round((now.getTime() - enq.createdAt.getTime()) / 1000) })
        .where(eq(schema.enquiries.id, enq.id));
    }
  }

  return { ...message, status: result.ok ? ("sent" as const) : ("failed" as const), error: result.ok ? null : result.error };
}

const ORDER = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4, received: 0 } as const;

/** Apply a delivery status from a webhook. Statuses only move forward. */
export async function applyStatus(
  d: DB,
  waMessageId: string,
  status: "sent" | "delivered" | "read" | "failed",
  error?: string,
) {
  const [m] = await d.select().from(schema.messages).where(eq(schema.messages.waMessageId, waMessageId)).limit(1);
  if (!m) return false;
  if (m.status === "failed" || ORDER[status] <= ORDER[m.status]) return true;
  await d.update(schema.messages).set({ status, error: error ?? null }).where(eq(schema.messages.id, m.id));
  if (m.campaignId) {
    const rs = status === "failed" ? "failed" : status;
    await d
      .update(schema.campaignRecipients)
      .set({ status: rs, error: error ?? null })
      .where(
        and(
          eq(schema.campaignRecipients.messageId, m.id),
          sql`${schema.campaignRecipients.status} not in ('replied')`,
        ),
      );
  }
  return true;
}
