"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { requireOrg } from "@/lib/auth";
import { sendInConversation, SendError } from "@/lib/wa/outbound";
import { stopBot } from "@/lib/flows/engine";
import { nextTicketNumber } from "@/lib/crm";
import { emit } from "@/lib/events";
import { queuePush } from "@/lib/push";

type Result = { ok: true } | { ok: false; error: string };

async function ownedConversation(id: string) {
  const ctx = await requireOrg();
  const [conv] = await ctx.db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.orgId, ctx.org.id)))
    .limit(1);
  if (!conv) throw new Error("Conversation not found");
  return { ctx, conv };
}

export async function sendReply(conversationId: string, text: string): Promise<Result> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > 4096) return { ok: false, error: "Messages can be up to 4096 characters." };
  const { ctx } = await ownedConversation(conversationId);
  try {
    await stopBot(ctx.db, conversationId);
    const m = await sendInConversation(ctx.db, conversationId, { kind: "text", body }, { senderKind: "user", senderUserId: ctx.user.id });
    if (m.status === "failed") return { ok: false, error: `WhatsApp didn't accept it: ${m.error}` };
    return { ok: true };
  } catch (e) {
    if (e instanceof SendError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function sendMedia(conversationId: string, mediaType: "image" | "document" | "video" | "audio", link: string, caption: string, uploadedName?: string | null): Promise<Result> {
  const ours = link.trim().startsWith(`${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/files/`);
  if (!ours && !/^https:\/\/\S+$/.test(link.trim())) return { ok: false, error: "Paste a public https:// link to the file. WhatsApp downloads it from there." };
  const { ctx } = await ownedConversation(conversationId);
  try {
    await stopBot(ctx.db, conversationId);
    const filename = mediaType === "document" ? (uploadedName ?? decodeURIComponent(link.split("/").pop()?.split("?")[0] ?? "file")) : undefined;
    const m = await sendInConversation(ctx.db, conversationId, { kind: "media", mediaType, link: link.trim(), caption: caption.trim() || undefined, filename }, { senderKind: "user", senderUserId: ctx.user.id });
    if (m.status === "failed") return { ok: false, error: `WhatsApp didn't accept it: ${m.error}` };
    return { ok: true };
  } catch (e) {
    if (e instanceof SendError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function sendTemplateReply(conversationId: string, templateId: string, variables: string[]): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  const [tpl] = await ctx.db
    .select()
    .from(schema.templates)
    .where(and(eq(schema.templates.id, templateId), eq(schema.templates.orgId, ctx.org.id), eq(schema.templates.status, "approved")))
    .limit(1);
  if (!tpl) return { ok: false, error: "Pick an approved template." };
  try {
    await stopBot(ctx.db, conversationId);
    const m = await sendInConversation(
      ctx.db,
      conversationId,
      { kind: "template", template: tpl, variables },
      { senderKind: "user", senderUserId: ctx.user.id, templateId: tpl.id },
    );
    if (m.status === "failed") return { ok: false, error: `WhatsApp didn't accept it: ${m.error}` };
    return { ok: true };
  } catch (e) {
    if (e instanceof SendError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function assign(conversationId: string, userId: string | null): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  if (userId) {
    const [m] = await ctx.db
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)))
      .limit(1);
    if (!m) return { ok: false, error: "That person isn't in this workspace." };
    await stopBot(ctx.db, conversationId);
  }
  await ctx.db
    .update(schema.conversations)
    .set({ assigneeId: userId, ...(userId ? { handledBy: "human" as const } : {}) })
    .where(eq(schema.conversations.id, conversationId));
  if (userId && userId !== ctx.user.id) await queuePush(ctx.db, "assigned", { conversationId, byUserId: ctx.user.id }).catch(() => {});
  return { ok: true };
}

/** Swipe action on mobile: puts the unread dot back so the chat is picked up later. */
export async function markUnread(conversationId: string): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  await ctx.db
    .update(schema.conversations)
    .set({ unreadCount: sql`greatest(${schema.conversations.unreadCount}, 1)` })
    .where(eq(schema.conversations.id, conversationId));
  return { ok: true };
}

export async function setStatus(conversationId: string, status: "open" | "closed"): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  if (status === "closed") await stopBot(ctx.db, conversationId);
  await ctx.db
    .update(schema.conversations)
    .set({ status, closedAt: status === "closed" ? new Date() : null, ...(status === "closed" ? { waitingSince: null, unreadCount: 0 } : {}) })
    .where(eq(schema.conversations.id, conversationId));
  return { ok: true };
}

export async function markRead(conversationId: string): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  await ctx.db.update(schema.conversations).set({ unreadCount: 0 }).where(eq(schema.conversations.id, conversationId));
  return { ok: true };
}

export async function setLabels(conversationId: string, labels: string[]): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  const clean = [...new Set(labels.map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  await ctx.db.update(schema.conversations).set({ labels: clean }).where(eq(schema.conversations.id, conversationId));
  return { ok: true };
}

export async function addNote(conversationId: string, body: string): Promise<Result> {
  if (!body.trim()) return { ok: false, error: "Write a note first." };
  const { ctx } = await ownedConversation(conversationId);
  await ctx.db.insert(schema.notes).values({ orgId: ctx.org.id, conversationId, authorId: ctx.user.id, body: body.trim() });
  return { ok: true };
}

export async function takeOver(conversationId: string): Promise<Result> {
  const { ctx } = await ownedConversation(conversationId);
  await stopBot(ctx.db, conversationId);
  await ctx.db.update(schema.conversations).set({ handledBy: "human", assigneeId: ctx.user.id }).where(eq(schema.conversations.id, conversationId));
  return { ok: true };
}

export async function convertToLead(conversationId: string, title: string, value: number): Promise<Result> {
  const { ctx, conv } = await ownedConversation(conversationId);
  const [stage] = await ctx.db
    .select()
    .from(schema.pipelineStages)
    .where(and(eq(schema.pipelineStages.orgId, ctx.org.id), eq(schema.pipelineStages.kind, "open")))
    .orderBy(asc(schema.pipelineStages.position))
    .limit(1);
  if (!stage) return { ok: false, error: "Add a pipeline stage first." };
  const [lead] = await ctx.db.insert(schema.leads).values({
    orgId: ctx.org.id,
    contactId: conv.contactId,
    conversationId,
    stageId: stage.id,
    title: title.trim() || "New lead",
    valueMinor: Math.max(0, Math.round(value * 100)),
    ownerId: ctx.user.id,
    source: "whatsapp",
  }).returning();
  await emit(ctx.db, ctx.org.id, "lead.created", { lead: { id: lead.id, title: lead.title, contactId: lead.contactId, source: lead.source } });
  await markEnquiry(ctx.db, conversationId, "lead");
  return { ok: true };
}

export async function convertToTicket(conversationId: string, subject: string, priority: string): Promise<Result> {
  const { ctx, conv } = await ownedConversation(conversationId);
  await ctx.db.insert(schema.tickets).values({
    orgId: ctx.org.id,
    number: await nextTicketNumber(ctx.db, ctx.org.id),
    contactId: conv.contactId,
    conversationId,
    subject: subject.trim() || "Support request",
    priority: (["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal") as "normal",
    assigneeId: ctx.user.id,
  });
  await markEnquiry(ctx.db, conversationId, "ticket");
  return { ok: true };
}

async function markEnquiry(d: Awaited<ReturnType<typeof requireOrg>>["db"], conversationId: string, to: "lead" | "ticket") {
  await d
    .update(schema.enquiries)
    .set({ status: "converted", convertedTo: to })
    .where(and(eq(schema.enquiries.conversationId, conversationId), sql`${schema.enquiries.status} <> 'converted'`));
}
